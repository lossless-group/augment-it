# deploy-relay

Railway deploy webhook → GitHub `repository_dispatch`.

Railway webhooks let you configure a URL and nothing else. GitHub's
`repository_dispatch` endpoint requires an `Authorization` header. Railway ships
muxers for Discord and Slack but not GitHub, so something has to sit between
them and add the header. That is all this does.

## The design decision that makes it safe

The relay does **not** forward Railway's payload as truth. It forwards a
**wake-up**. `deploy-watch.yml` then queries the Railway API itself and reaches
its own conclusion, exactly as it does on a cron tick.

Railway payloads are not cryptographically signed. Because nothing downstream
believes the body, a forged request can at worst trigger one extra authoritative
sweep — it can never manufacture a false failure or hide a real one. This is
Railway's own guidance implemented: *"Treat a webhook as a prompt to act, not a
source of truth. When you need certainty, reconcile against the public API."*

## Why Vercel and not Railway

A monitor that shares a failure domain with the thing it monitors is not a
monitor. Hosted on Railway, a Railway incident would take out the deploys and
the thing meant to tell you about them at the same time.

## What it forwards

Only `FAILED` / `CRASHED` deployment events. `SUCCESS` and the transient states
(`BUILDING`, `DEPLOYING`, `INITIALIZING`, `QUEUED`) are dropped.

One push redeploys 11 services and each emits several status transitions;
forwarding all of them would queue dozens of runs behind a concurrency group
that does not cancel. Recovery — closing the issue once things are green — is
left to the hourly cron, which is the right tool for a non-urgent transition.

Uninteresting events still get a `200`. Railway retries non-2xx three times and
disables a URL that fails 100 times in 6 hours; "received and ignored" is a
success, not an error.

## Environment

| Variable | Value |
|---|---|
| `RELAY_SECRET` | Shared secret; must match the `?key=` in the Railway webhook URL |
| `GITHUB_REPOSITORY` | `lossless-group/augment-it` |
| `GITHUB_DISPATCH_TOKEN` | Fine-grained PAT, `Contents: Read and write` on augment-it |

## Setup

1. **Mint the GitHub token** — github.com/settings/personal-access-tokens →
   Fine-grained → repo `lossless-group/augment-it` → Repository permissions →
   **Contents: Read and write**. That is the permission `repository_dispatch`
   requires; nothing else is needed.

2. **Deploy and set env:**

   ```bash
   cd services/deploy-relay
   vercel --prod
   vercel env add RELAY_SECRET production
   vercel env add GITHUB_REPOSITORY production        # lossless-group/augment-it
   vercel env add GITHUB_DISPATCH_TOKEN production
   vercel --prod                                       # redeploy to pick up env
   ```

3. **Point Railway at it** — Railway → project `augment-it` → Settings →
   Webhooks → add:

   ```
   https://<deployment>.vercel.app/api/railway?key=<RELAY_SECRET>
   ```

   Railway's **Test Webhook** button sends from the browser and often trips
   CORS; a delivery failure there does not mean the relay is broken. Verify with
   the curl below instead.

## Verifying

```bash
# Should 404 (wrong key) — and stay vague about why
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL?key=wrong" \
  -H 'content-type: application/json' -d '{}'

# Should 200 with forwarded:false
curl -s -X POST "$URL?key=$RELAY_SECRET" -H 'content-type: application/json' \
  -d '{"type":"Deployment.succeeded","details":{"status":"SUCCESS"}}'

# Should 200 with forwarded:true, and start a deploy-watch run
curl -s -X POST "$URL?key=$RELAY_SECRET" -H 'content-type: application/json' \
  -d '{"type":"Deployment.failed","details":{"status":"FAILED"},
       "resource":{"service":{"name":"shell"},"environment":{"name":"production"}}}'
```

The last one triggers a real sweep. Because the workflow re-queries Railway
rather than trusting the payload, a healthy stack yields a green run that closes
nothing — which is itself the proof that the payload is not load-bearing.

## Rotating the secret

Change `RELAY_SECRET` in Vercel, redeploy, then update the Railway webhook URL.
Order matters: the old URL 404s the moment the env changes.
