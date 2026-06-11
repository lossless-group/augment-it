---
title: "LinkedIn Network Explorer — slicing your own connection graph by geography for curated invites, when LinkedIn won't let you query it directly"
lede: "A client is hosting a dinner in Manhattan and the operator wants to invite their LinkedIn contacts who actually live in NYC. LinkedIn's public API removed the connections endpoint years ago, their Terms of Service explicitly forbid scraping, and they ban accounts that get caught. So the question isn't 'how do I scrape LinkedIn' — it's 'given that LinkedIn is hostile to programmatic querying of your own network, which legitimate paths let you produce a geo-filtered slice of your connections in time for next week's dinner, and which of those compose with augment-it's existing pack-runner / record-set / response-reviewer stack so the same pattern works for the next client dinner and the one after that.' This exploration walks the four paths (data export + enrichment cascade, Sales Navigator subscription, third-party scraping services, direct careful scraping), names the legal/ban posture of each, and lands a recommendation that dogfoods augment-it — because the operator has literally built the tool for 'augment a list of contacts with metadata you don't have yet,' and this use case is the canonical instance of that pattern."
date_created: 2026-06-11
date_modified: 2026-06-11
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

**Path A** for the dinner. Plus the side benefit that we ship a
`linkedin-location-pack` to augment-it, which means the second time this
need arises (and it will — every fundraise, every conference, every
"who do I know in $CITY") the answer is "ingest the export, run the
pack, filter the lens."

**Fall back to Path C** if Path A's confidence on the invite list is
below acceptable (operator's judgment call on the actual triage) AND
the dinner timeline justifies the account risk. Decision point lives
at the end of the first augment-it run: if 60% of your connections
have clean locations, you have enough Manhattan hits to fill the dinner
table — proceed. If 30% have clean locations, the invite list is too
sparse; spend $99 on Sales Nav for a one-shot, or eat the account risk
on PhantomBuster.

**Path B** is the right answer if you already have Sales Navigator for
other reasons (recruiting, BD pipeline). The marginal cost is zero, the
data is authoritative.

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

For the immediate dinner, the operator's path:

1. **Today:** Request LinkedIn connections export.
2. **Today (parallel):** Decide if the pack ships in time, or if a
   manual approach via the lens covers the dinner. For a small invite
   list (~20-30 people), even Path A's first pass through 5K rows is
   over-engineering — but the pack ships an asset that pays back next
   time, so the engineering work is justified.
3. **Tomorrow (export arrives):** Ingest into augment-it.
4. **Tomorrow:** Run the pack (or, if not yet built, run a one-off
   prompt via prompt-template-manager: *"Find the current city or
   region of <{first_name} {last_name}>, who works at <{company}>.
   Respond with only a location string or 'unknown'."*). The
   prompt-runner can fire this against the existing search-tools-
   enabled prompt path; same result, less reusable.
5. **Tomorrow:** Lens-filter to Manhattan / NYC. Triage edge cases.
   Hand the list to the client.

The prompt-template path is the actual minimum-lift; the pack is the
asset that compounds.

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
