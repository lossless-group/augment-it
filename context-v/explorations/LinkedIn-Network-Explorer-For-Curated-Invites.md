---
title: "LinkedIn Network Explorer — slicing your own connection graph by geography for curated invites, when LinkedIn won't let you query it directly"
lede: "LinkedIn won't tell you which of your own connections live in Manhattan. The data export plus augment-it's enrichment cascade is the path."
date_created: 2026-06-11
date_modified: 2026-06-14
revisions:
  - 2026-06-14 — Added Path A.5 (console-snippet extraction) after a sharper read on terms posture.
  - 2026-08-17 — Rejected Path A.5 and removed its mechanics. It is a §8.2 terms violation whether or not it is enforced, and Path A reaches the same invite list from data LinkedIn hands over on request. Recommendation reverted to Path A.
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
site_uuid: 6ca08dd1-bdb2-403d-a182-e6065236095d
hex_code: zmh92f
date_authored_initial_draft: 2026-06-14
date_authored_current_draft: 2026-06-14
publish: false
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

### Path A.5 — Console-snippet extraction from pages you're already viewing (rejected)

There is a middle path between manual copy-paste and a pack-based
pipeline: a piece of JavaScript pasted into the browser console that walks
the already-rendered DOM of a page you are looking at and emits a CSV.

**We are not documenting the mechanics of it here, and it is not the
recommended path.** LinkedIn's User Agreement §8.2 prohibits accessing the
service "through any automated means," and a DOM-walking script is
automation regardless of how it is triggered. The honest read is that this
is a terms violation whose *practical* enforcement risk at one-shot manual
scale is low — but "unlikely to be caught" is not the standard this
repository writes toward, and augment-it's whole positioning is that it
gets the answer *without* touching linkedin.com.

The spectrum, for calibration:

| Approach | Terms violation? | Practical risk |
|---|---|---|
| Manual copy-paste of names | No | None |
| Console snippet / bookmarklet triggered by hand | Yes | Low |
| Browser extension auto-scrolling and extracting | Yes | Low–medium |
| Headless automation with your session cookie | Yes | High |
| Third-party SaaS (Path C) | Yes | Low but real |

Only the first row is unambiguously clean. Everything below it trades a
terms violation for speed. Path A gets to the same invite list from data
LinkedIn hands you on request, so the trade isn't necessary.

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

**Path A for the dinner.** Request the LinkedIn data export (Settings →
Data Privacy → Get a copy of your data → Connections). It arrives in
minutes to hours and hands you first name, last name, company, title, and
profile URL for your entire network — legitimately, at LinkedIn's
invitation. What it omits is location, which is exactly the gap the
`linkedin-location-pack` closes by inferring a city from public web
snippets. Zero cost, zero account risk, no terms question to weigh.

**Fall back to Path C** only if Path A doesn't produce a viable list AND
the timeline justifies the account risk. Realistic for high-volume
recurring extraction across a 30K+ network, not for a single dinner.


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

For the immediate dinner, the operator's path collapses to Path A:

1. **Now:** Request the connections export — LinkedIn Settings → Data
   Privacy → *Get a copy of your data* → **Connections**. Small archives
   often land in ~10 minutes; budget a few hours.
2. **Now:** While that generates, build the geo-filtered search URL in
   LinkedIn's normal UI (your-network filter plus the geoUrn array for the
   metro you care about) and read the result set on screen. For a dinner-
   sized list, reading and noting the names you actually want to invite is
   both faster and cleaner than any extraction scheme.
3. **When the export lands:** Ingest the CSV into augment-it as a record
   set. First name, last name, company, title, profile URL.
4. **Then:** Run the `linkedin-location-pack` over the rows to infer a
   current city from public web snippets, with a confidence score and the
   evidence string attached to each guess.
5. **Then:** Open the sort-filter lens, filter location for the metro, and
   sort by confidence. Hand-check the low-confidence rows — at dinner
   scale that's a handful of people, not a data-quality project.
6. **Then:** Export the filtered set as the invite list.

Total elapsed time: dominated by how long LinkedIn takes to generate the
export. The work on our side is minutes.


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
