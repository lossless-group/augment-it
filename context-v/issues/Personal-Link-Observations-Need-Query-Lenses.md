---
title: "Personal-link observations need named query lenses — without them, an accumulating fact log goes uninspected"
lede: "The `has_personal_link` observation predicate added with the PersonalLinks pulse-dimension stores rich qualifiers (`kind`, `title`, `url_domain`, `org_id`) that we expect to query in specific shapes — per-person presence rollup, per-org corpus rollup, kind-filtered slices for analyst views. None of those queries exist yet. As personal-links accumulate (a single thought leader can easily contribute 50+), the operator will hit 'I have the data but no way to look at it' unless we name the lenses up front and ship them as we hit the friction."
date_created: 2026-06-15
date_modified: 2026-06-15
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
status: Open
severity: low
tags:
  - Issue
  - Augment-It
  - Canonical-Layer
  - Personal-Links
  - Query-Lenses
  - Person-Enrichment
  - Funder-Content-Corpus
---

# Personal-link observations need named query lenses

## Context

The [[Sparse-Person-Enrichment-Surface]] v0.0.0.1 adds a PersonalLinks
pulse-dimension that writes one observation per captured URL with
predicate `has_personal_link` and qualifiers carrying `kind`, `title`,
`url_domain`, and (when matched) `org_id`. Schema:

```sql
CREATE observations SET
  subject     = persons:<X>,
  predicate   = "has_personal_link",
  object      = "https://philanthropyroundtable.org/team/stephen-allison/",
  observed_at = time::now(),
  source      = "person-enrichment",
  qualifiers  = {
    kind:       "team_page",
    title:      "Stephen Allison · The Philanthropy Roundtable",
    url_domain: "philanthropyroundtable.org",
    org_id:     organizations:<phil-roundtable>
  },
  client      = "reach-edu";
```

That shape is the canonical fact log. The querying lenses aren't built.

## The queries we anticipate

Captured here so they're discoverable when someone hits the friction.

### Per-person presence rollup

> "Show me everywhere we've found Stephen on the public web."

```sql
SELECT object AS url, qualifiers.kind AS kind, qualifiers.title AS title, observed_at
  FROM observations
  WHERE subject = persons:<X> AND predicate = "has_personal_link"
  ORDER BY observed_at DESC;
```

Useful for: prep before a meeting, generating a credibility card,
seeding a briefing doc.

### Per-org corpus rollup (lens onto Funder-Content-Corpus)

> "Show me all the blog posts, publications, and press releases on
> philanthropyroundtable.org we've captured, regardless of which
> person we captured them through."

```sql
SELECT object AS url, subject AS author, qualifiers.kind, qualifiers.title, observed_at
  FROM observations
  WHERE predicate = "has_personal_link"
    AND qualifiers.url_domain = "philanthropyroundtable.org"
    AND qualifiers.kind IN ["blog_post", "publication", "press_release", "research_report"]
  ORDER BY observed_at DESC;
```

Useful for: the Funder-Content-Corpus lens — the same data we'd
otherwise have to crawl the funder's site for. The PersonalLinks
dimension is the operator-curated path into corpus; the cron crawler is
the automated path. They write the same predicate; this query reads
both.

### Kind-filtered slice across the whole canonical layer

> "Show me everyone we know who's been on a podcast (any podcast)."

```sql
SELECT subject AS person, object AS url, qualifiers.title, observed_at
  FROM observations
  WHERE predicate = "has_personal_link"
    AND qualifiers.kind = "podcast"
    AND client_access CONTAINS $workspace_slug
  ORDER BY observed_at DESC;
```

(The client_access filter applies via the subject person — handled by
materialization or join.)

Useful for: "who'd be a good guest for our event," "who has thought
leadership on X."

### Team-page-only lens (the "first instance" relationship)

> "For each known org, which of our people appears on their team page?"

```sql
SELECT subject AS person, qualifiers.org_id AS org, object AS url, observed_at
  FROM observations
  WHERE predicate = "has_personal_link"
    AND qualifiers.kind = "team_page"
    AND qualifiers.org_id IS NOT NONE
    AND client_access CONTAINS $workspace_slug;
```

Useful for: the operator's "do we actually know an insider at this org"
question — distinct from a vendor relationship or an alumni connection.

## What we should index for these to stay fast

At ≤30K entities and the redundancy ethos, indexes are cheap. Adding
these when the friction arrives:

```sql
DEFINE INDEX personal_link_kind   ON observations FIELDS predicate, qualifiers.kind;
DEFINE INDEX personal_link_domain ON observations FIELDS predicate, qualifiers.url_domain;
DEFINE INDEX personal_link_org    ON observations FIELDS predicate, qualifiers.org_id;
```

Not adding them now — premature indexing is a real cost in clarity, and
the lenses aren't built yet. Add when one is slow.

## Resolution path

This isn't a bug to fix — it's a flagged future-state. Resolution = when
an operator workflow hits one of the listed lenses, we either:

1. Ship the query as a SurrealQL function (`DEFINE FUNCTION
   fn::presence_for_person($id)`) — fast, reusable, cacheable.
2. Ship the query inside the pulse-surface's read path (e.g. show
   existing personal-links above the input form so the operator sees
   what's already captured for this person).
3. Ship a new lens surface that takes a query intent and renders the
   results.

Default to (1) + (2). (3) is a real undertaking and only justifies
itself when ≥3 lenses are in active use.

## See also

- [[Sparse-Person-Enrichment-Surface]] — the v0 surface; PersonalLinks
  dimension lives here.
- [[Pulse-Pattern]] — the pattern PersonalLinks instantiates.
- [[Funder-Content-Corpus]] — the corpus rollup lens directly bridges
  the operator-curated path here with the automated crawl path there.
- [[Canonical-Entity-Registry-on-SurrealDB-Cloud]] — the data layer
  these lenses run against.
- [[Client-Tagging-on-Canonical-Writes]] — every lens reads through the
  workspace_slug filter.
