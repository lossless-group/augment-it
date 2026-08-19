---
title: "In-App Browser vs Browser Plugin for Corpus Add — bridging the operator's own search into the per-record corpus without leaving the cockpit"
lede: "Adding one operator-found URL to a funder's corpus is a ten-step round-trip out to Google and back. In-app browser, or browser plugin?"
date_created: 2026-06-08
date_modified: 2026-06-08
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
revisions:
  - 2026-06-08 — Initial draft. Written alongside shipping the Content Reader's per-card manual-URL affordance. The affordance works but the operator's "open Google, search, find a result, copy URL, switch back to Content Reader, expand the right card, paste" loop is ~7 explicit actions per add. This doc explores how to shrink it.
tags:
  - Exploration
  - Augment-It
  - Content-Reader
  - Funder-Corpus
  - Per-Record-Augmentation
  - Browser-Plugin
  - In-App-Browser
  - Operator-UX
status: Active
site_uuid: 6a5ce0dc-e4f8-4515-978e-06547e0b0413
hex_code: h14os1
date_authored_initial_draft: 2026-06-08
date_authored_current_draft: 2026-06-08
publish: true
---

# In-App Browser or Plugin for Corpus Add

## The friction this would remove

After shipping the per-card "+ add URL manually" affordance, the
operator can paste any URL into a record's corpus from inside the
Content Reader. That's the right primitive, but it leaves a
multi-context-switch loop:

1. Read the record name in Augment-It.
2. Switch to browser tab.
3. Type the funder name + topic into Google.
4. Scan results, click promising link.
5. Skim, decide it belongs.
6. Copy URL.
7. Switch back to Augment-It.
8. Find the right card (scroll, since 96 records).
9. Expand the manual-add affordance.
10. Paste URL, click Preview.
11. Edit title + tags, click Add.

Steps 2 – 8 are the friction. Steps 9 – 11 are unavoidable (and
intentional — Rule 5 / operator decides per item). The friction lives
in the round-trip between *the surface where the operator is reasoning
about a record* and *the surface where they're searching the open web*.

Two ways to collapse this — and they're not mutually exclusive.

## Option A — In-app browser / search surface

Embed a search-and-browse experience inside Augment-It, scoped to "the
current record." The operator never leaves the cockpit.

### Sketch

A new tab / panel inside Content Reader (or a new federated remote
mounted alongside Response Reviewer) that, when a record is "active":

- Renders a search box that pre-fills `<funder_name> <topic>` queries
  against an embedded search provider — SearXNG (already wired into the
  stack for the pack layer; same container can serve the operator's
  one-off queries) or Tavily / Firecrawl-search if richer SERP is wanted.
- Lists results inline with title + snippet + URL.
- Clicking a result either:
  - Opens it in an embedded iframe / web-view panel, OR
  - Skips the inline view and routes directly to `content_ingest.
    preview_url` for that record + URL, landing the operator in the
    same "edit title + tags + add" flow that already exists.

### Trade-offs

**For:**

- **Zero context-switch.** The operator stays in one tab. Searches
  are pre-scoped to the active record's funder name.
- **Same auth context.** Everything the operator does is observable
  to Augment-It — the system can log "operator searched X for record
  Y" as part of the per-record audit trail, useful later for surfacing
  "we've already looked for grants at this funder, here's what we
  found" on re-visits.
- **No browser-extension store / install dance.** Ships with the
  product. Works on first login.
- **Composable with existing pieces.** SearXNG is already running.
  `content_ingest.preview_url` is already the right capability. The
  in-app surface is a thin UI layer on top of plumbing that exists.

**Against:**

- **Iframe / web-view limits.** Many target sites (LinkedIn,
  Substack, modern news sites) block being iframed via
  `X-Frame-Options` or `Content-Security-Policy: frame-ancestors`.
  We'd either show a "this site refuses to be embedded — open in a
  new tab?" fallback (which re-introduces the context-switch) or
  proxy the page through our own server (which is the road to a
  half-baked browser, and a long one).
- **Search quality lag.** SearXNG is a metasearch aggregator; it's
  often *good enough* but not as polished as searching Google
  directly. The operator who *prefers* their Google account + Google
  history (operators who've trained their results over years) loses
  that advantage.
- **No JS-rendered pages.** Some funder sites are JS-only; a plain
  iframe shows nothing useful. Firecrawl scraping is the
  workaround, but at that point we're not really an "in-app browser"
  — we're a content extractor with a search box.
- **Engineering cost is non-trivial.** New federated remote (or new
  view inside Content Reader), search results component, embedded
  preview pane, hook into the active record. ~1 named branch + PR
  worth of work even at minimum viable.

### Maximally-minimal version of Option A

If we want a cheap try: add a Google-search-link button on each
Content Reader card that opens
`https://www.google.com/search?q=<funder_name>+<topic>` in a new tab,
pre-scoped to the funder. Reduces steps 2 – 4 above to "click button"
without any embedded-browser engineering. Step 6 – 9 stay. Useful as a
nudge regardless of whether we build the fuller version.

## Option B — Browser plugin / extension

Ship a Chrome/Firefox/Safari extension that, when the operator is on
any page they want to add to a funder's corpus, posts the page's URL
into Augment-It's content-ingest pipeline with one click (or
keystroke).

### Sketch

The plugin button (or `Cmd+Shift+L` chord, name TBD) does the
following:

1. Reads the active tab's URL + title + selected text.
2. Asks Augment-It "which record is currently active in Content Reader?"
   via either:
   - A localhost API on a known port (Augment-It workspace service
     exposes a `/active-record` HTTP endpoint OR
   - A small extension-side picker if no active record is selected
     (search-as-you-type against the record set).
3. Posts `{record_id, url, title?, tags?}` to a new workspace
   capability — `corpus.add_from_browser_plugin` — that wraps the
   existing `content_ingest.preview_url` + `corpus.add` two-step into
   a single server-side call (the operator already curated by
   choosing to send this URL; the per-item preview-then-add
   ceremony can be skipped or shown as an inline confirmation toast).
4. Toast on success: "Added to <funder>'s corpus."

### Trade-offs

**For:**

- **The operator searches where they normally search.** Google with
  their account, their history, their search settings. This is
  meaningful — operators who do a lot of research have trained their
  search environment and shouldn't have to abandon it.
- **Works on any page, any site.** No iframe / X-Frame-Options
  issue. Whatever the operator can see in their browser is
  legitimately reachable.
- **Minimum-click add.** One click on any page → URL lands in the
  active record's corpus. The corpus add flow becomes nearly
  zero-friction — exactly what the operator wants when they're in a
  "10 records to research" rhythm.
- **Same backend.** The extension calls the same capabilities the
  Content Reader UI calls. No new ingest path, no new data shape, no
  new corpus filesystem layout.

**Against:**

- **The "active record" handshake.** This is the design problem.
  Options:
  - Extension queries Augment-It's localhost API for "what's the
    record open in Content Reader right now?" — works only when the
    Augment-It tab is the most-recently-focused Augment-It tab and
    the operator actually has a record in focus.
  - Extension picker — operator types funder name in the extension's
    popup; nice fallback, requires extension to mirror the record
    set. Cost: another small data sync, but small.
  - URL convention — operator copies a record-specific "corpus
    inbox" URL once per record and the extension posts to it. Most
    flexible, most operator overhead.
- **Browser-extension distribution overhead.** Chrome web store
  review, Firefox AMO review, Safari has its own dance, manifest v3
  vs v2 migration scars, signing for the corporate IT environments
  that block sideloading. For a single-operator tool used inside
  the Lossless team this is fine (sideload the .crx); for a
  multi-tenant SaaS audience this is friction.
- **CORS / localhost limits.** Extension talking to
  `http://localhost:3000/api/...` has historically worked but
  requires careful `host_permissions` declarations and is more
  fragile across browsers than calling a public HTTPS endpoint.
  Workaround: a small public auth gateway. Now we're shipping
  infrastructure for a feature that's supposed to be friction-saving.
- **Per-browser engineering.** Chrome, Firefox, Safari each have
  enough manifest differences that "ship to all three" is real
  work. Chrome-only ships faster but excludes Safari users (the
  ops team's default).
- **Security model.** An extension that posts the active tab's URL
  to localhost has to be careful about scope (don't post anything
  unless the operator explicitly clicked the button). Compromised
  extensions are a real threat vector; need code-signing + small
  surface area + auditable source.

### Minimum-viable version of Option B

If we want a cheap try: a **bookmarklet**, not a full extension. A
JavaScript snippet the operator drags to their bookmarks bar that,
when clicked, opens a small Augment-It popup pre-filled with the
current tab's URL — operator picks the record, clicks Add. No
extension store, no per-browser engineering, no signing. The
operator does need to install once (drag to bookmarks bar) but it's
a one-time setup.

The bookmarklet doesn't need the "active record handshake" problem
solved — it presents a picker every time. Slower per-add than a true
extension but radically less infrastructure.

## A and B compose

These are not either-or:

- **A** (in-app search) helps the operator who's at their desk
  triaging records and wants to stay in the cockpit.
- **B** (plugin / bookmarklet) helps the operator who's reading some
  random article and realizes "oh, this is actually about a funder
  in our pipeline."

Both feed the same `content_ingest.preview_url` + `corpus.add`
plumbing. Building one doesn't lock the other out.

## Recommendation

**Ship the cheapest version of both first, see which one the operator
actually reaches for, then invest.**

Order:

1. **Cheapest of A — the Google-search-link button on every Content
   Reader card** (single line of JSX, pre-fills the funder name).
   Reduces steps 2 – 4. Ships in minutes.
2. **Cheapest of B — a bookmarklet** that opens an Augment-It popup
   with the active tab's URL pre-filled. Slightly more work but
   still small.
3. **Run for a week with both.** Watch which one the operator
   actually uses and for what kinds of records.
4. **Decide.** If the operator lives in step 1 (most adds happen
   from the Content Reader cockpit), invest in fuller Option A —
   the in-app SERP + embedded preview. If the operator lives in
   step 2 (most adds happen "I'm reading a thing and want to file
   it"), invest in a proper extension with the active-record
   handshake.

This is the same "ship the small thing, observe the operator's
actual behavior, then commit" pattern that's served the rest of
Augment-It well — the per-record connector palette evolved this way,
the Content Reader itself evolved this way.

## Unknowns to resolve before any commit

- **Does the operator prefer Google specifically, or are they
  search-engine-agnostic?** If specifically Google, Option B
  (plugin) is strictly better than Option A (since SearXNG ≠
  Google). If agnostic, Option A's SearXNG search is fine and the
  in-app-cockpit advantage tips the scale.
- **How often does the operator find URLs by browsing (not
  searching)?** If "I'm reading an article and realize it's for
  record Y" is a real pattern, Option B is mandatory; Option A
  can't help with that case.
- **How many records per session does the operator add manual URLs
  to?** If it's a few per session, even the existing manual-add
  affordance is probably enough and Options A/B are over-engineering.
  If it's dozens per session, friction-saving compounds and a real
  extension pays for itself fast.
- **Is per-record audit-trail observability of the operator's
  search history a feature or surveillance?** Option A enables it
  for free; Option B doesn't (the search happens in the operator's
  browser, invisible to Augment-It). For solo operator + own
  workspace this is fine; for multi-operator team with privacy
  considerations, it's a real conversation.

## Related

- [[../specs/Funder-Content-Corpus-Workflow.md]] — the workflow this
  exploration sits on top of; Rule 5 (operator decides per item) is
  the principle that lets any of these options keep working without
  re-litigating Rule 1.
- [[../specs/Response-Reviewer-Shell-and-Content-Reader-Mode.md]] —
  where the in-app version of Option A would mount.
- [[../blueprints/Packs-and-Bundles-Pattern.md]] — the plugin /
  bookmarklet path is a different shape than a pack but shares the
  "operator triggers a per-record action that posts to a capability
  on the workspace" pattern; might be worth blueprinting if more
  external-trigger features land.
- [[Agent-Chat-Skills-and-Commands-Candidates.md]] — `corpus.add_
  from_browser_plugin` would be a candidate verb if/when we build
  Option B; the active-record handshake design feeds the chat
  surface's own active-context discipline.
- [[Per-Client-Privacy-and-the-Path-Off-Local.md]] §Path D — the
  corpus storage that both options write into.
