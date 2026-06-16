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
