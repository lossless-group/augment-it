// Railway deploy webhook → GitHub repository_dispatch.
//
// WHY THIS EXISTS
// Railway webhooks let you configure a URL and nothing else — no custom
// headers. GitHub's repository_dispatch endpoint requires an Authorization
// header. There is no Railway "muxer" for GitHub (only Discord and Slack), so
// something has to sit between them and add the header. That is this file's
// entire job.
//
// THE LOAD-BEARING DESIGN DECISION
// This relay does NOT forward Railway's payload as truth. It forwards a
// WAKE-UP. The workflow it triggers then queries the Railway API itself and
// reaches its own conclusion, exactly as it does on a cron tick.
//
// That matters for two reasons:
//   1. Railway payloads are NOT cryptographically signed. Anyone who learns
//      the URL could post one. Since we never believe the body, a forged
//      request can at worst cause an extra authoritative sweep — it can never
//      manufacture a false failure or hide a real one.
//   2. Railway's own docs: "Treat a webhook as a prompt to act, not a source
//      of truth. When you need certainty, reconcile against the public API."
//      This is that sentence, implemented.
//
// WHY IT RUNS ON VERCEL AND NOT RAILWAY
// A monitor that shares a failure domain with the thing it monitors is not a
// monitor. If this ran on Railway, a Railway incident would take out both the
// deploys and the thing meant to tell you about them.

import { timingSafeEqual } from 'node:crypto';

// Statuses that mean "this did not ship." Everything else — SUCCESS and the
// transient states (BUILDING, DEPLOYING, INITIALIZING, QUEUED, WAITING) — is
// deliberately ignored.
//
// Forwarding only failures keeps dispatch volume near zero. One push
// redeploys 11 services and each emits several status transitions; forwarding
// all of them would queue dozens of workflow runs behind a concurrency group
// that does not cancel. Recovery (closing the issue once things are green) is
// left to the hourly cron, which is the right tool for a non-urgent transition.
const FAILURE_STATUSES = new Set(['FAILED', 'CRASHED']);

function authorized(req) {
  const expected = process.env.RELAY_SECRET;
  if (!expected) return false;
  // Railway can only be given a URL, so the shared secret rides in the query
  // string. Compare in constant time and length-guard first — timingSafeEqual
  // throws on a length mismatch rather than returning false.
  // Read the key from Vercel's parsed query when present, falling back to
  // parsing req.url. The runtime does not guarantee the query string survives
  // on req.url, and a silently-empty key here fails closed as a 404 — which
  // looks exactly like a wrong secret and is miserable to debug.
  const presented =
    (typeof req.query?.key === 'string' ? req.query.key : null) ??
    new URL(req.url ?? '', 'http://localhost').searchParams.get('key') ??
    '';
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  if (!authorized(req)) {
    // Deliberately vague: a probe should not learn whether the path was right
    // and only the key was wrong.
    return res.status(404).json({ error: 'not found' });
  }

  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const type = String(body.type ?? '');
  const status = String(body?.details?.status ?? '');
  const service = body?.resource?.service?.name ?? 'unknown';
  const environment = body?.resource?.environment?.name ?? 'unknown';

  const isDeployEvent = type.startsWith('Deployment.');
  const looksFailed = FAILURE_STATUSES.has(status.toUpperCase()) || /failed|crashed/i.test(type);

  // Always answer 2xx, even when we choose not to forward. Railway retries
  // non-2xx three times and disables a URL that fails 100 times in 6 hours —
  // "I received this and decided it was uninteresting" is a success, not an
  // error.
  if (!isDeployEvent || !looksFailed) {
    // Log the ignore too. Without this an arriving-but-uninteresting event
    // leaves only a bare request line, so "Railway is wired up correctly and
    // this deploy was fine" is indistinguishable from "Railway never called
    // us" — which is exactly the question you ask when verifying the hookup.
    console.log(`ignored: ${service}/${environment} type=${type || '(none)'} status=${status || '(none)'}`);
    return res.status(200).json({ ok: true, forwarded: false, reason: 'not a failed deployment', type, status });
  }

  const repo = process.env.GITHUB_REPOSITORY;   // e.g. lossless-group/augment-it
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!repo || !token) {
    console.error('relay misconfigured: GITHUB_REPOSITORY or GITHUB_DISPATCH_TOKEN missing');
    return res.status(500).json({ error: 'relay misconfigured' });
  }

  const gh = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event_type: 'railway-deploy-event',
      // Context only — for the run's name and for a human reading the trigger.
      // The workflow does NOT branch on any of it.
      client_payload: { service, environment, status, type },
    }),
  });

  if (!gh.ok) {
    const detail = await gh.text();
    console.error(`repository_dispatch failed: ${gh.status} ${detail}`);
    // A 5xx here is honest: Railway will retry, which is what we want when the
    // failure is GitHub-side or the token has expired.
    return res.status(502).json({ error: 'dispatch failed', status: gh.status });
  }

  console.log(`dispatched: ${service}/${environment} ${type} ${status}`);
  return res.status(200).json({ ok: true, forwarded: true, service, environment, status });
}
