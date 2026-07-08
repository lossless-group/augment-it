// Shapes we read from / write to SurrealDB. SCHEMALESS so any field can
// appear; these are the ones the v0 enrichment UI touches.

export type SurrealId = string;  // e.g. `persons:u"019ece03-b895-..."`

export type Person = {
  id: SurrealId;
  email?: string | null;
  emails?: string[] | null;        // additional emails accumulate here
  first_name?: string | null;
  surname?: string | null;
  full_name?: string | null;       // stored — materialized from first_name + surname
  // Some sources (e.g. person-db-resolver, which never splits first/last)
  // write a single `name` field instead of first_name/surname/full_name.
  // Display-only fallback — see hydrateForm()'s displayName.
  name?: string | null;
  source?: string | null;
  client_access?: string[] | null;
  // we don't render most other fields in v0; surfaced for triage only
  rsvp_event?: string | null;
  warnings?: string[] | null;
};

export type Organization = {
  id: SurrealId;
  slug: string;
  complete_name?: string | null;
  conventional_name?: string | null;
  client_access?: string[] | null;
};

export type EventRow = {
  id: SurrealId;
  slug: string;
  name: string;
  starts_at?: string | null;
  total_attendees?: number | null;
  source?: string | null;
  source_url?: string | null;
  venue_text?: string | null;
  host_text?: string | null;
};

// Reach-edu's Gatsby attendee row — what we have from the parse before
// the operator enriches it. Read-only on the surface.
export type AttendeeSparse = {
  person_id: SurrealId;
  email: string;
  rsvp_event: string | null;
  rsvp_event_date: string | null;
  warnings: string[];
  q2_company: string | null;
  q3_position: string | null;
};

// Loose vocabulary for the `kind` qualifier on link observations
// (has_personal_link for person subjects, has_org_link for org
// subjects). SCHEMALESS at the DB layer — the kind is a hint, not a
// constraint. `other` is the always-safe fallback when the URL
// doesn't pattern-match.
export type LinkKind =
  // profile / "things the entity owns or operates"
  | 'linkedin_profile'
  | 'linkedin_company'
  | 'x_profile'
  | 'github_profile'
  | 'substack'
  | 'website'           // entity's homepage (bare domain)
  | 'threads_profile'
  | 'bluesky_profile'
  | 'mastodon_profile'
  // content / "things they made or appear in / publish"
  | 'team_page'
  | 'author_bio'
  | 'blog_post'
  | 'press_release'
  | 'publication'
  | 'podcast'
  | 'speaking_event'
  | 'news_feature'
  | 'interview'
  | 'video'
  | 'careers'
  | 'about'
  | 'other';

export type Link = {
  url: string;
  kind: LinkKind;
};

// One email domain associated with an org. An org can have many — e.g.
// IHS has its own `theihs.org` AND `ihs.gmu.edu` because it's housed in
// George Mason University. `kind` is free-text so the operator can use
// whatever fits ("primary", "secondary", "alias", "parent_domain", "subunit",
// "legacy", etc.) — no dropdown, same flexibility as link kind.
export type OrgDomain = {
  domain: string;     // bare hostname — "theihs.org", "ihs.gmu.edu"
  kind:   string;     // free-text
  added_at?: Date;
};

// What an autocomplete row carries — enough to fully hydrate an
// AffiliationState when the operator clicks it.
export type OrgSuggestion = {
  id:                 any;           // SDK RecordId
  complete_name:      string | null;
  conventional_name:  string | null;
  org_links?:         Link[]      | null;
  org_corpus?:        Link[]      | null;
  domains?:           OrgDomain[] | null;
};

// One affiliation card on the person-enrichment surface. A person can
// have many — primary employer + board seats + advisor roles + past
// employers — each one is one row in this array and produces one
// `affiliations` graph edge against the person on save. Role is
// free-text; the operator types whatever fits ("board", "primary",
// "past CFO", "investor"). The `kind` field on the affiliations edge
// gets this string.
export type AffiliationState = {
  uiId:               string;     // local crypto.randomUUID() for #each key + ephemeral identity
  expanded:           boolean;    // collapsed pill (shows role · conventional_name) vs expanded edit card
  role:               string;     // free-text — written to affiliations.kind on the edge
  activeOrgId:        any;        // SDK RecordId once the org exists; null when adding new
  completeName:       string;
  conventionalName:   string;
  orgLinks:           Link[];
  orgCorpus:          Link[];
  orgDomains:         OrgDomain[];   // email-domains the org owns / accepts mail at — many per org allowed
  affiliationCreated: boolean;    // true if the edge already exists (loaded) OR has been written this session
  autoDetectedFrom:   'email_domain' | 'previous_affiliation' | null;
};
