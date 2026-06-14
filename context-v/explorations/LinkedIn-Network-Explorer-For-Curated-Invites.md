---
title: "LinkedIn Network Explorer — slicing your own connection graph by geography for curated invites, when LinkedIn won't let you query it directly"
lede: "A client is hosting a dinner in Manhattan and the operator wants to invite their LinkedIn contacts who actually live in NYC. LinkedIn's public API removed the connections endpoint years ago, their Terms of Service explicitly forbid scraping, and they ban accounts that get caught. So the question isn't 'how do I scrape LinkedIn' — it's 'given that LinkedIn is hostile to programmatic querying of your own network, which legitimate paths let you produce a geo-filtered slice of your connections in time for next week's dinner, and which of those compose with augment-it's existing pack-runner / record-set / response-reviewer stack so the same pattern works for the next client dinner and the one after that.' This exploration walks the four paths (data export + enrichment cascade, Sales Navigator subscription, third-party scraping services, direct careful scraping), names the legal/ban posture of each, and lands a recommendation that dogfoods augment-it — because the operator has literally built the tool for 'augment a list of contacts with metadata you don't have yet,' and this use case is the canonical instance of that pattern."
date_created: 2026-06-11
date_modified: 2026-06-14
revisions:
  - 2026-06-14 — Added Path A.5 (DevTools snippets) after a sharper read on TOS posture; the original draft treated the TOS as black-and-white and over-recommended the pack-based path for use cases where a one-shot manual extraction is the right tool. The two snippets land at `tools/browser-snippets/linkedin/` and are referenced from the "Dinner-specific minimum lift" section.
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
status: Draft
tags:
  - Exploration
  - LinkedIn
  - Network-Graph
  - Geographic-Filtering
  - Curated-Invites
  - Anti-Scraping-Posture
  - Augment-It-Dogfood
  - Sales-Navigator
  - PhantomBuster
  - Data-Export
  - Manhattan-Dinner
  - Trigger-Engagement
---

# LinkedIn Network Explorer — geo-slicing your own connection graph

## What this exploration is for

A client is hosting a dinner in Manhattan and the operator wants to surface
their own LinkedIn connections who currently live in NYC so they can be
invited. The hard part isn't "how do I find people in Manhattan" — LinkedIn
trivially shows you that for the public population. The hard part is:

> **Of the ~N thousand people I'm already connected to on LinkedIn,
> which ones live in Manhattan right now?**

LinkedIn knows the answer. LinkedIn won't tell you the answer through any
free, programmatic interface, and they will ban your account if you try to
extract it via automation they can detect. So this is a question about
working around an unfriendly platform's stance without getting your account
torched, and ideally about doing it in a way that composes with augment-it's
existing pipeline so the same pattern works for the next dinner and the
recruiter list and the alumni reunion after that.

This document is **not** a spec. It is the journey-mode doc that walks the
four credible paths, names what each one costs (in dollars, time, and
account-risk), and lands a recommendation. The next step after alignment is
likely either a tight spec (`[[LinkedIn-Geo-Filter-Pack.md]]`) or just
"run the data export and use the existing augment-it surface" — depending
on which path we pick.

## What LinkedIn gives you for free

Naming this explicitly because the "for free" surface is genuinely useful:

- **Connections data export** (Settings → Data Privacy → Get a copy of your
  data → Connections). Yields a CSV with columns:
  `First Name, Last Name, URL, Email Address, Company, Position, Connected On`.
  **Notably absent: location.** Wait time is "up to 24 hours" but typically
  4–8 hours in practice.
- **Profile pages** of any 1st-degree connection show their current
  city/region in the header. Manually clickable; not programmatically
  fetchable without authenticated session + their anti-scrape posture.
- **The "My Network" graph** (linkedin.com/mynetwork) — visible list of
  connections, scrollable, but no filter UI exposed.
- **Posts** of your connections that you've engaged with — searchable via
  the activity feed.

The export is the load-bearing freebie. Everything we do downstream has
to start from "you have a CSV of N rows with name + company + profile URL,
and no location."

## What LinkedIn deliberately denies

So the rest of the doc is honest about what it's working around:

- **No public connections API.** LinkedIn v2 API has no
  `/me/connections` endpoint since deprecation circa 2015. Sign-In-with-
  LinkedIn returns basic profile only — not your network.
- **Anti-scraping aggression.** Detection includes: behavioral
  fingerprinting (mouse movement, scroll cadence), session-cookie
  analysis, IP reputation, request-rate per endpoint, headless-browser
  fingerprints, CAPTCHA, and — most painfully — account suspension /
  permanent ban for offenders.
- **TOS prohibition.** Section 8.2 of LinkedIn's User Agreement
  forbids "scrap[ing], copy[ing], display[ing], or otherwise us[ing]
  any information made available on the Services through automated
  means…"
- **Legal posture.** The 2019 Ninth Circuit ruling in *hiQ Labs v.
  LinkedIn* held that public-profile scraping is not a CFAA violation,
  but LinkedIn subsequently won on contract/TOS grounds in 2022.
  Practically: scraping public LinkedIn profiles is not criminal, but
  LinkedIn can and will ban accounts and pursue civil action against
  commercial scrapers.

The operator is correctly cautious. "Sensitively, as I know LinkedIn
will deny scrapers" is the right starting posture.

## Four paths, ranked by composability with augment-it

### Path A.5 — DevTools snippets run by hand on your own search-results / profile pages

Sitting between manual copy-paste and a pack-based pipeline: a tiny piece of
JavaScript pasted into your browser's DevTools Console that walks the
already-rendered DOM of a page YOU are looking at and produces a structured
CSV / JSON blob.

**Mechanic:**

1. Build your filtered search URL in LinkedIn's normal UI (e.g.,
   `network=["F"]` + `geoUrn=[<NYC metro>, <Manhattan>]`). Confirm the
   results look right.
2. Open DevTools (Cmd+Option+I), Console tab.
3. Paste `tools/browser-snippets/linkedin/linkedin-search-results-to-csv.js`,
   hit Enter. Console.table()'s the captured rows.
4. Click LinkedIn's Next button. Up-arrow + Enter to re-run on the new page.
   Accumulator de-dupes by URL.
5. Repeat until you've covered the page range you care about.
6. Run `window.__liDownloadCsv()` — downloads `linkedin-network-<ts>.csv`.
7. For high-value contacts, navigate to their profile page individually,
   paste `tools/browser-snippets/linkedin/linkedin-profile-to-row.js`, get
   richer fields (full headline, current role, location, About paragraph,
   top 3 Experience entries).

**Why this isn't path D in disguise:**

- No request to linkedin.com beyond what your normal clicks already make —
  the snippet only reads HTML the browser already rendered.
- No scheduling, no polling, no headless browser, no rotating proxy.
- Single-shot, manual trigger, human-paced.
- LinkedIn's anti-scrape detection targets behavioral patterns (rate,
  fingerprint, cadence) that single-shot manual extraction by definition
  doesn't produce.

**TOS posture (honest):**

LinkedIn's Section 8.2 is broad enough to cover "any automated means," and
a DOM-walking script is technically automation. The TOS is broad for three
reasons that don't really apply at this scale: (1) protecting Sales
Navigator revenue from competitive-scale exporters, (2) defending the
aggregate graph against mass scraping, (3) maintaining LinkedIn's position
as consent-mediator between you and your network. None of those concerns
fire on a single user manually clicking through their own connections.

The pragmatic spectrum:

| Approach | TOS violation? | Practical risk |
|---|---|---|
| Manual copy-paste of names | No | None |
| Bookmarklet / Console snippet you trigger by hand | Technically yes | Vanishingly low |
| Browser extension auto-scrolling and extracting | Yes | Low–medium |
| Headless puppeteer with your cookie | Yes | High |
| Third-party SaaS (Path C) | Yes | Low but real |

Path A.5 is the second row. Operators who care about both their LinkedIn
presence AND getting the dinner invite list done by Thursday sit there.

**Account risk:** Vanishingly low for one-shot use. The DOM-extraction
pattern is not what LinkedIn's detection looks for.

**Cost:** $0. Two .js files in the repo, no SaaS, no subscription.

**Time to first invite list:**
- Open search URL with your geo filter. ~2 minutes.
- Paste snippet, scroll + re-run per page. ~10-15 minutes for hundreds of
  rows depending on how many pages you walk.
- CSV downloaded. Import into augment-it as record set OR just open in
  Numbers/Sheets and filter manually for the dinner.

**Composability:** High in a different way than Path A. The CSV lands in
augment-it as a record set the same as any export, AND the snippets
themselves are reusable next time you need to slice the network by a
different geo. Plus — for the "click into high-value profiles" workflow
the operator is already willing to do, the profile snippet captures the
deep data Path A's snippet-search inference can't.

**Where it underperforms:**
- Selector maintenance — LinkedIn rotates class names every few months
  to break scrapers. The snippets degrade gracefully (try multiple
  candidate selectors, log when none match) but eventually need a quick
  selector update. The head comments document the procedure.
- Manual pagination — at 5K+ contacts this becomes tedious. Path A or
  Path B scales better past that.

**This is the right tool for the dinner.** Path A's value comes when you
want enrichment beyond what LinkedIn's UI already shows — *infer* a
location from public web snippets when LinkedIn won't tell you. Path A.5's
value comes when LinkedIn IS already telling you (you've built the right
search URL), you just need to get that data off the screen and into a CSV.
For a one-shot dinner invite list, Path A.5 wins.

### Path A — Data export + augment-it enrichment cascade (recommended)

Use LinkedIn's own export to get the connection list, then enrich each row
with location via the search-provider seam augment-it already has wired
(SearXNG / Tavily / SerpApi). LinkedIn never knows we're asking — we're
querying Google/Bing/etc. for snippets of the public profile.

**Mechanic:**

1. Operator requests connections export from LinkedIn settings; CSV
   arrives in their email ~4 hours later.
2. CSV ingests into augment-it as a record set via the existing
   `record_set.ingest` capability. Columns map per the existing dynamic-
   schema discipline — name, URL, company, position become the first-class
   row fields with no prompt engineering required.
3. A new pack — `linkedin-location-pack` — fires per row. The pack:
   - Builds a query like
     `"<First Name> <Last Name>" "<Company>" site:linkedin.com/in OR site:about.me OR site:twitter.com`
   - Hits the configured search provider (SearXNG default; Tavily peer
     for tougher cases).
   - Parses the top result snippets for a location string. LinkedIn's
     own search-result snippets typically expose "Greater New York City
     Area" or "Manhattan, NY" right in the meta description. We never
     touch linkedin.com directly.
   - Returns a `Candidate` with `display_name: location`, `confidence
     0-100`, `snippet: <evidence>`. Structured response shape augment-it
     already understands.
4. Response Reviewer's by-record cockpit lets the operator triage:
   accept good locations, flag wrong ones, supply missing ones from
   their own memory (the inline "supply a URL the pack didn't find" UI
   pattern generalizes to "supply a location the pack couldn't infer").
5. Sort & Filter Lens (the lens that already ships) filters the
   record set to `location contains "Manhattan"` or
   `location contains "New York"`. That's the invite list.

**Account risk:** Zero. No automation touches LinkedIn. The connections
export is your own data downloaded through the supported UI. The location
inference happens via Google/Bing/DuckDuckGo, which are designed to be
queried programmatically.

**Cost:** Marginal — uses the SearXNG container already running locally
($0) for default queries; Tavily for harder cases ($0 free tier covers
~1K queries/month). No third-party SaaS.

**Time to first invite list:**
- Export request: submit now, arrives 4-8h later.
- Pack build: this is the only new code — `services/social-search/src/
  entity-pulse/packs/linkedin-location-pack.ts` or similar — and most of
  the scaffolding (pack discovery, fan-out, response shape) is already
  there. Estimate: one focused session.
- Running the pack on a typical 5K-row export: ~30-45 minutes at the
  4-call concurrency cap social-search holds today.
- Triage: depends on operator pace; the lens makes this fast.

**Composability:** Maximum. Every artifact lands in augment-it's existing
data model. The next time you do this for a different client, you re-run
the same pack against a fresh export. The next time you want to filter
by "lives in Bay Area" or "works at a Series A startup" — same pattern,
different pack or different prompt.

**Where it underperforms:** Location is only as good as the search
snippet. For low-profile contacts who don't surface much public web
presence, the pack returns `outcome: not_found` and the operator has to
either skip them or look them up manually. Realistic confidence: maybe
60-75% of contacts get a clean location hit on first pass; 85-90% with
a second pass that broadens the query or pulls Twitter bio location.

### Path B — Sales Navigator subscription

Pay LinkedIn $99/month for Sales Navigator, which exposes geography-based
filtering on your 1st-degree connections through their official UI. Export
the filtered list. Cancel.

**Mechanic:**

1. Subscribe to Sales Navigator ($99/mo, monthly cancelable).
2. In Sales Nav: Lead Filters → Geography → "Manhattan, New York, United
   States" + Custom Filter → Connection: "1st degree connections."
3. Save the search as a Lead List.
4. Export: Sales Nav does NOT have a native "Export to CSV" button on the
   free interface. Two sub-paths:
   - a. Manual: scroll the results, copy data row by row. Painful at scale.
   - b. Use a third-party tool that hooks the Sales Nav cookies (see Path
     C) to export. Same account-risk discussion as C.
5. Cancel subscription before next billing cycle.

**Account risk:** Low for the subscription + UI use itself. Risk
materializes if you use a third-party exporter (back to Path C dynamics).

**Cost:** $99 for one month, possibly $0 if your client/employer covers
it.

**Time to first invite list:** Same day if you have the Sales Nav account
already, else 1-2 days to set up the subscription + trial period.

**Composability:** Low. The output is a CSV in Sales Nav's format that
you import into augment-it as just another record set. No reusable
augment-it asset created. Next dinner, you do the same dance again.

**Where it shines:** Sales Nav's filtering is authoritative — it knows
the location LinkedIn knows, not the location a Google snippet infers.
For a high-value invite list (10-20 people, dinner with the client's
biggest target prospect), this is genuinely better data.

### Path C — Third-party scraping services (PhantomBuster, Clay, TexAu,
Apify, Captain Data, Evaboot)

A whole industry exists around extracting LinkedIn data despite LinkedIn's
posture. These services maintain rotating cookie pools, IP rotation, and
behavioral simulation to stay under detection thresholds. You give them
your LinkedIn session cookie; they run on your behalf.

**Mechanic:**

1. Pick a service. PhantomBuster ($59-149/mo) and Clay ($149+/mo) are
   the most polished; TexAu and Captain Data are cheaper alternatives.
2. Configure a "phantom" (PhantomBuster's word for a job) — e.g.,
   "LinkedIn Network Booster," "Sales Navigator Search Export," or
   "LinkedIn Profile Scraper."
3. Provide your LinkedIn session cookie (the `li_at` cookie value from
   your authenticated browser session).
4. Service runs the scrape under your account; output is CSV with name,
   profile URL, location, headline, current company.
5. Import the CSV into augment-it.

**Account risk:** Real and asymmetric. PhantomBuster claims to stay
under LinkedIn's detection thresholds (rate limits, request patterns)
but bans do happen, especially if you push volume. Forum reports
suggest 1-3% of accounts using these services get flagged within a
year. The cost of a ban is your entire LinkedIn presence — connections,
posts, recommendations, work history.

**Cost:** $59-149/mo, prorate-able for one-month use.

**Time to first invite list:** Same day. These tools are mature.

**Composability:** Medium. Output is CSV → augment-it record set. No
augment-it-native asset created, but the workflow can be re-run easily.

**Where it shines:** Lowest-friction path to a complete, location-tagged
list of your connections. Best ROI per hour spent if you accept the
account-risk premium.

**Where it underperforms:** Account risk. For an operator whose
professional reputation lives on LinkedIn — and the operator's pulse
work is exactly that — risking the account for ONE dinner invite list
is bad math. If this becomes a monthly recurring need, the math changes.

### Path D — Direct careful scraping (not recommended for this use case)

Write a script that authenticates as the operator, walks the connections
graph, scrapes each profile for location. The technical part is
straightforward (Puppeteer + LinkedIn cookie + careful pacing) but
LinkedIn's anti-scrape posture has gotten much better; success rate for
unassisted DIY scrapers is poor.

**Why this is bad math here:**
- All the cost of Path C (account risk) with none of the benefit (you
  haven't paid someone whose business is to keep their detection
  evasion current).
- The cat-and-mouse is constant; the script that works this week may
  trigger CAPTCHAs next week.
- The operator is building augment-it, not LinkedIn scraping
  infrastructure. Yak-shaving.

Listed for completeness; deprioritized for any real engagement.

## Recommendation

**Path A.5 for the dinner.** Build the geo-filtered search URL in
LinkedIn's UI, paste the search-results snippet on each page as you
click through, click into high-value profiles individually and paste the
profile snippet. Output is a CSV you can use directly or ingest into
augment-it as a record set. Zero cost, vanishingly low account risk,
done in an hour.

**Path A** stays in the longer-arc plan — the `linkedin-location-pack`
remains the right shape for cases where LinkedIn's UI isn't already
telling you the answer (e.g., "find people in my network who recently
moved to NYC but haven't updated their profile yet" needs the
public-snippet inference; LinkedIn's geoUrn filter alone won't catch
them). The dinner doesn't require it; the next harder slice might.

**Fall back to Path C** only if Path A.5 + Path A together don't produce
a viable list AND the timeline justifies the account risk. Realistic
for high-volume recurring extraction across a 30K+ network, not for
the dinner.

**Path B** is the right answer if you already have Sales Navigator for
other reasons (recruiting, BD pipeline). The marginal cost is zero, the
data is authoritative, and Sales Nav's geo filter is more precise than
LinkedIn's free search.

## What "shipping the linkedin-location-pack" looks like as augment-it code

Concretely so the next step is reactable:

```
services/social-search/src/entity-pulse/packs/linkedin-location-pack.ts
  Defines a Pack with:
  - input_schema: rows from a LinkedIn-export CSV
    (first_name, last_name, company, linkedin_url)
  - query_template:
    `"{first_name} {last_name}" "{company}" site:linkedin.com/in OR
     "Greater New York" OR "Manhattan, NY" OR "Brooklyn, NY"`
  - extractor: parse top 3 result snippets for a city / region string;
    return Candidate with display_name = location, confidence based on
    how many snippets agree, snippet = the evidence string.

services/social-search/src/connectors/...
  Existing SearXNG + Tavily connectors handle the actual query — no
  new connector work needed. Reuses the same dispatch path entity-pulse
  packs already do.

apps/sort-filter-lens/...
  No change. The lens already supports filtering on any string column;
  "filter location contains Manhattan" is just a sort/filter key.

Eventually:
context-v/specs/LinkedIn-Geo-Filter-Pack.md
  If this exploration converges, the spec pins the pack's contract,
  the query templates, the confidence scoring, and the explicit
  acknowledgment that the pack does NOT touch linkedin.com.
```

The pack is genuinely small — maybe 150 lines of code reusing existing
infra. The leverage comes from augment-it's existing surface area, not
from new infrastructure.

## The dinner-specific minimum lift

For the immediate dinner, the operator's path collapses to Path A.5:

1. **Now:** Build the search URL in LinkedIn's UI — your network
   filter (`network=["F"]`) plus the geoUrn array for NYC metro +
   Manhattan. The URL the operator already arrived at is the right
   shape:
   ```
   https://www.linkedin.com/search/results/people/?origin=FACETED_SEARCH&network=%5B%22F%22%5D&geoUrn=%5B%22102571732%22%2C%2290000070%22%5D
   ```
2. **Now:** Open DevTools (Cmd+Option+I), Console tab.
3. **Now:** Paste `tools/browser-snippets/linkedin/linkedin-search-results-to-csv.js`,
   Enter. Inspect the console.table() output; if name / location columns
   look right, proceed.
4. **Now:** Click LinkedIn's Next button. Up-arrow + Enter in the console.
   Repeat until you've covered the page range. The accumulator de-dupes by
   profile URL so re-running is safe.
5. **Now:** Run `window.__liDownloadCsv()` — downloads the CSV.
6. **Now (optional):** For people you want richer data on, click into their
   profile individually, paste `linkedin-profile-to-row.js` to capture full
   headline / location / About / top 3 Experience entries.
7. **Now:** Either filter the CSV directly in Numbers/Sheets for the dinner
   invite list, OR ingest into augment-it as a record set if you want the
   lens + chat workflow.

Total elapsed time: ~30 minutes for hundreds of contacts.

If selectors come back stale on the first run (snippet says "no results
container found"), inspect one card in DevTools → Elements, copy the
enclosing list/card selectors, update SELECTORS at the top of the file,
re-run. The snippet logs which selector path it used so the maintenance
loop is tight.

## The pattern this instances

"Slice a list of people I know by an attribute I don't have in the
CSV" is the recurring shape. Today the attribute is location. Soon it'll
be:

- Industry (for a sector-specific dinner)
- Recent activity (for re-engagement campaigns)
- Funding stage of their current employer (for fundraise outreach)
- Whether they've been promoted recently (for congratulations + reach)
- Whether they're hiring (for placement intros)

Each is a different pack against the same connection CSV, each landing
in augment-it's existing record set. The dinner-invite use case isn't
the goal; it's the trigger for noticing that augment-it should have a
**network-explorer surface** — a lens or composite that lives on top of
"your imported contact list" and lets you slice it by any inferred
attribute.

That surface is the `feat/linkedin-network-explorer` direction this
branch is named after. The dinner is the proof-of-life run; the
network-explorer is the asset.

## Open questions

- **What's the actual size of the operator's LinkedIn network?** 1K rows
  vs 10K vs 30K changes the time / cost calculus on Path A. A 30K
  scrape via SearXNG at 4-concurrency takes ~125 minutes; a 1K scrape
  takes 4 minutes.
- **Does the operator already have Sales Navigator?** If yes, Path B is
  free.
- **What's the dinner timeline?** "Next week" vs "next month" changes
  whether Path A's "build the pack" detour is justifiable.
- **Does the client know we're inviting our contacts?** They probably
  do (they're hosting in NYC, they want NYC attendees) but the
  relationship-disclosure dimension matters for warm/cold framing.
- **Is there a 2nd-degree dimension?** The operator's 1st-degree
  contacts can extend the invite to *their* contacts in NYC. That's a
  separate question and a different scrape surface (2nd-degree requires
  Sales Nav or premium).
- **Should the location-pack confidence factor in "how recently they
  updated their profile"?** A 2023 location string is more trustworthy
  than a 2018 one. The pack could surface a freshness signal alongside
  the location.
- **What about people who've moved recently?** Even Sales Nav's data
  lags reality. The most authoritative signal is recent posts geotagged
  in NYC. Different pack — `linkedin-recent-activity-location-pack` —
  for the cases that matter.

## Provisional next steps

Not a commitment, just the natural progression if this exploration
converges:

1. **Operator action:** Request the LinkedIn connections export from
   settings (zero risk, ~4h wait).
2. **Operator action:** Confirm dinner timeline so we know whether to
   build the pack now or use the one-off prompt path.
3. **Spec:** `[[LinkedIn-Geo-Filter-Pack.md]]` in
   `augment-it/context-v/specs/`, written if Path A is the chosen
   direction. Pins the pack contract, query templates, confidence
   scoring, and explicit "does not touch linkedin.com" disclosure.
4. **Implementation:** A focused session on
   `services/social-search/src/entity-pulse/packs/linkedin-location-pack.ts`.
   Reuses existing pack-runner / response-reviewer infra.
5. **Reflective doc:**
   `[[Network-Explorer-As-A-Recurring-Augment-It-Surface.md]]` (an
   exploration) capturing the broader pattern — the dinner is the
   trigger, the surface is the asset.

## See also

- **Augment-it pack-runner pattern:**
  [[Packs-and-Bundles-Pattern]] (blueprint that defines what a "pack" is
  in augment-it's vocabulary).
- **Search provider seam:** [[Funder-Content-Corpus-Workflow]] §"Step 5"
  for the SearXNG-default + Tavily-peer connector arrangement the
  linkedin-location-pack would reuse.
- **Inline triage UX:** [[Response-Reviewer-Shell-and-Content-Reader-Mode]]
  for the response-reviewer cockpit pattern the operator would use to
  approve/flag/supply location strings.
- **Sort & Filter Lens:** the existing lens that does the final
  "filter to Manhattan" step. Code at `apps/sort-filter-lens/`.
- **External — LinkedIn TOS Section 8.2:** the official prohibition
  on scraping (linkedin.com/legal/user-agreement). Cited here so the
  account-risk framing is honest, not editorial.
- **External — hiQ Labs v. LinkedIn:** the 2019 Ninth Circuit decision
  and 2022 contract-grounds reversal. Relevant background for anyone
  weighing the legal posture of scraping public LinkedIn profiles.
- **External — PhantomBuster, Clay, TexAu, Apify, Captain Data,
  Evaboot:** the third-party-scraping services named in Path C. None
  of these are endorsed; named for completeness so the operator can
  evaluate independently.
