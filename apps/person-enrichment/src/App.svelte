<script lang="ts">
  // PULSE-SURFACE for the person-enrichment remote.
  //
  // A pulse-surface hosts ONE entity at a time and composes N
  // pulse-dimensions against it (name, socials, additional emails,
  // organization, web presence). The operator works through the
  // worklist of attendees for ONE event, and each pulse — one search
  // burst or affiliation edit per attendee — fills as many dimensions
  // as the operator has for them.
  //
  // Event-picker (2026-07-07, per context-v/specs/Augment-From-Affiliations.md):
  // replaces the v0 hardcoded EVENT_SLUG. Two real consequences of
  // generalizing past the Gatsby-invite shape this app originally
  // targeted, both load-bearing, not cosmetic:
  //   1. The attendee query no longer filters by a fixed RSVP predicate
  //      allowlist — ANY observation whose object is the picked event
  //      counts as an attendance signal (speaker_at, sponsor_of,
  //      invited_to, ...). Other predicates never use an event as their
  //      object, so this is safe without enumerating every event-tie
  //      verb that exists today or gets added later.
  //   2. The worklist is now EVERY attendee, not just ones missing a
  //      full_name. person-db-resolver-sourced persons (e.g. FreedomFest
  //      speakers) already have a `.name` and will never have a
  //      `full_name` — gating the worklist on "!full_name" would have
  //      hidden all of them, defeating the reason this app is being
  //      reused for affiliation link/corpus editing in the first place.
  // v0 still talks directly to SurrealDB; later slices proxy through
  // per-dimension services.

  import { onMount, onDestroy } from 'svelte';
  import { getDb, disconnect, CLIENT } from './lib/surreal';
  import type { Person, EventRow, Link, OrgDomain, OrgSuggestion } from './lib/types';

  import NameFields       from './pulse-dimensions/NameFields.svelte';
  import EmailListField   from './pulse-dimensions/EmailListField.svelte';
  import LinkList         from './pulse-dimensions/LinkList.svelte';
  import AffiliationCard  from './pulse-dimensions/AffiliationCard.svelte';
  import type { AffiliationState } from './lib/types';

  // ---- State -----------------------------------------------------------------

  let events       = $state<EventRow[]>([]);
  let eventSlug    = $state<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem('augment-it:person-enrichment:event-slug') : null,
  );
  let event = $state<EventRow | null>(null);
  let allAttendees = $state<Person[]>([]);
  let worklist     = $state<number[]>([]);
  let worklistIdx  = $state<number>(0);

  let loading = $state(true);
  let status  = $state<string>('');
  let error   = $state<string | null>(null);

  // Pulse-dimension state, owned by the surface, bound via $bindable.
  let first_name           = $state('');
  let surname              = $state('');
  let additional_emails    = $state<string[]>([]);
  let personal_links       = $state<Link[]>([]);   // identity URLs
  let personal_corpus      = $state<Link[]>([]);   // content URLs (LLM-ingest target)
  let affiliations         = $state<AffiliationState[]>([]);  // org affiliations — primary + board + advisor + past + …

  const current = $derived(
    worklistIdx >= 0 && worklistIdx < worklist.length
      ? allAttendees[worklist[worklistIdx]]
      : null,
  );
  // full_name (Gatsby-shape) or name (person-db-resolver-shape) — display
  // fallback only, never written back as-is (savePersonName still writes
  // first_name/surname/full_name; a .name-only person keeps their .name
  // untouched unless the operator explicitly edits first/last here).
  const displayName = $derived(current?.full_name || current?.name || null);

  const enrichedCount = $derived(allAttendees.filter((p) => p.full_name || p.name).length);
  const totalCount    = $derived(allAttendees.length);
  const remainingInWorklist = $derived(Math.max(0, worklist.length - worklistIdx));

  // ---- Load ------------------------------------------------------------------

  async function loadEvents() {
    try {
      const db = await getDb();
      const r = await db.query(
        `SELECT * FROM events WHERE client_access CONTAINS $client ORDER BY first_seen_at DESC`,
        { client: CLIENT },
      );
      events = ((r?.[0] as any[]) || []) as EventRow[];
      if (!eventSlug && events.length) eventSlug = events[0].slug;
    } catch (e: any) {
      error = e?.message || String(e);
    }
  }

  function onPickEvent() {
    if (typeof localStorage !== 'undefined' && eventSlug) {
      localStorage.setItem('augment-it:person-enrichment:event-slug', eventSlug);
    }
    void load();
  }

  async function load() {
    if (!eventSlug) return;
    loading = true; error = null; status = 'connecting…';
    try {
      const db = await getDb();

      status = 'loading event…';
      const evResult = await db.query(
        'SELECT * FROM events WHERE slug = $slug LIMIT 1',
        { slug: eventSlug },
      );
      const ev = (evResult?.[0] as any)?.[0];
      if (!ev) throw new Error(`event ${eventSlug} not found`);
      event = ev;

      // No hardcoded predicate allowlist — see the header comment. ANY
      // observation whose object is this event counts as an attendance
      // signal, regardless of which event-tie verb wrote it.
      status = 'loading attendees…';
      const peopleResult = await db.query(
        `SELECT * FROM persons
           WHERE id IN (
             SELECT VALUE subject FROM observations WHERE object = $event_id
           )
           ORDER BY first_seen_at ASC`,
        { event_id: ev.id },
      );
      allAttendees = ((peopleResult?.[0] as any[]) || []) as Person[];

      // Every attendee, not just ones missing a full_name — see the header
      // comment for why gating on "!full_name" would hide already-named
      // (person-db-resolver-sourced) attendees entirely.
      worklist = allAttendees.map((_p, i) => i);
      worklistIdx = 0;

      hydrateForm();
      status = '';
    } catch (e: any) {
      error = e?.message || String(e);
      status = '';
    } finally {
      loading = false;
    }
  }

  // (activeOrgId / autoDetectedFrom / affiliationCreated now live INSIDE
  // each AffiliationState — see lib/types.ts. The per-card AffiliationCard
  // owns one of these. The savers below take an `i` parameter to indicate
  // which affiliation index they're committing to.)

  // Personal-email providers — skipped by auto-detect because their domain
  // doesn't identify an org. Same list we'll seed into a SurrealDB table
  // later when the personal-email-domains lookup gets formalized.
  const PERSONAL_EMAIL_DOMAINS = new Set([
    'gmail.com', 'yahoo.com', 'ymail.com',
    'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
    'me.com', 'mac.com', 'icloud.com',
    'aol.com', 'comcast.net', 'verizon.net', 'sbcglobal.net', 'att.net',
    'protonmail.com', 'proton.me', 'pm.me', 'hey.com',
    'fastmail.com', 'gmx.com', 'gmx.us',
  ]);

  function hydrateForm() {
    const c = current;
    first_name           = c?.first_name           ?? '';
    surname              = c?.surname              ?? '';
    additional_emails    = (c?.emails ?? []).filter((e) => e && e !== c?.email);
    personal_links       = (c as any)?.personal_links  ?? [];
    personal_corpus      = (c as any)?.personal_corpus ?? [];
    affiliations         = [];
    // Auto-detect loads ALL existing affiliations + (when none) suggests
    // one based on email-domain.
    void autoDetectAffiliations();
  }

  function newAffiliationState(initial: Partial<AffiliationState> = {}): AffiliationState {
    return {
      uiId:               crypto.randomUUID(),
      expanded:           true,
      role:               '',
      activeOrgId:        null,
      completeName:       '',
      conventionalName:   '',
      orgLinks:           [],
      orgCorpus:          [],
      orgDomains:         [],
      affiliationCreated: false,
      autoDetectedFrom:   null,
      ...initial,
    };
  }
  function addAffiliation() {
    affiliations = [...affiliations, newAffiliationState()];
  }
  function removeAffiliation(i: number) {
    // Only removes from this person's UI session — does NOT delete the
    // org row or any already-saved affiliations edge. To remove the
    // edge you'd query SurrealDB directly.
    affiliations = affiliations.filter((_, idx) => idx !== i);
  }

  async function autoDetectAffiliations() {
    if (!current) return;
    const db = await getDb();

    // 1. Existing affiliations (graph traversal) — load ALL, each as a
    //    collapsed pill the operator can click to expand for edit.
    try {
      // LEAN fetch — just enough to render the collapsed pill. The
      // heavier per-org fields (org_links / org_corpus / domains)
      // hydrate lazily via hydrateOrgDetail() when the operator
      // expands a pill. Keeps page-load fast even when a person has
      // many affiliations.
      const r = await db.query(
        `SELECT
            kind                       AS role,
            added_at,
            out.id                     AS org_id,
            out.complete_name          AS complete_name,
            out.conventional_name      AS conventional_name
           FROM affiliations
           WHERE in = $id
           ORDER BY added_at ASC`,
        { id: current.id },
      );
      const edges = ((r?.[0] as any) ?? []) as any[];
      if (edges.length > 0) {
        affiliations = edges.map((e) => newAffiliationState({
          expanded:           false,            // collapsed pill on load
          role:               String(e.role ?? ''),
          completeName:       String(e.complete_name ?? ''),
          conventionalName:   String(e.conventional_name ?? ''),
          activeOrgId:        e.org_id,
          affiliationCreated: true,             // edge already exists in canonical
          autoDetectedFrom:   'previous_affiliation',
        }));
        return;
      }
    } catch { /* fall through to email-domain heuristic */ }

    // 2. No existing affiliations — email-domain match against orgs.
    //    If we find one, surface it as ONE auto-detected pill (operator
    //    can confirm by expanding + Entering on the role / name fields).
    const domain = current.email?.split('@')[1]?.toLowerCase().replace(/^www\./, '');
    if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return;
    try {
      const r = await db.query(
        `SELECT * FROM organizations
           WHERE client_access CONTAINS $client
             AND (
               $domain IN domains.*.domain
               OR $domain IN org_links.*.url_domain
               OR $domain IN org_corpus.*.url_domain
             )
           LIMIT 1`,
        { client: CLIENT, domain },
      );
      const o = (r?.[0] as any)?.[0];
      if (o) {
        // Email-domain match runs once. We can include the heavier
        // fields here without paying per-affiliation cost — there's
        // at most one match and the response is one row.
        affiliations = [newAffiliationState({
          expanded:           false,            // auto-suggestion shows as a pill
          role:               'primary',        // safe default for email-domain match
          completeName:       String(o.complete_name ?? ''),
          conventionalName:   String(o.conventional_name ?? ''),
          activeOrgId:        o.id,
          orgLinks:           (o.org_links ?? []) as Link[],
          orgCorpus:          (o.org_corpus ?? []) as Link[],
          orgDomains:         (o.domains   ?? []) as OrgDomain[],
          affiliationCreated: false,            // edge doesn't exist yet for THIS person
          autoDetectedFrom:   'email_domain',
        })];
      }
    } catch { /* no match, leave empty */ }
  }

  // Lazy per-org hydration — fired by AffiliationCard.expand() when the
  // operator opens a pill. Pulls org_links / org_corpus / domains for
  // ONE org and patches them into affiliations[i]. Idempotent: if the
  // fields are already populated, skips the query.
  async function hydrateOrgDetail(i: number) {
    const a = affiliations[i];
    if (!a || !a.activeOrgId) return;
    // Skip if any of the three are already non-empty — already hydrated
    // (either from an explicit pickOrg or a prior expand).
    if (a.orgLinks.length || a.orgCorpus.length || a.orgDomains.length) return;
    try {
      const db = await getDb();
      const r = await db.query(
        `SELECT org_links, org_corpus, domains FROM $id LIMIT 1;`,
        { id: a.activeOrgId },
      );
      const row = (r?.[0] as any)?.[0];
      if (!row) return;
      affiliations[i] = {
        ...affiliations[i],
        orgLinks:   (row.org_links ?? []) as Link[],
        orgCorpus:  (row.org_corpus ?? []) as Link[],
        orgDomains: (row.domains   ?? []) as OrgDomain[],
      };
    } catch { /* silently — the card still works with empty arrays */ }
  }

  // ---- Org autocomplete + pick-existing ------------------------------------
  // Debounced lookup the AffiliationCard calls as the operator types into
  // complete_name. Matches both name fields case-insensitively and pulls
  // the full row so a click can fully hydrate the affiliation.
  async function lookupOrgs(q: string): Promise<OrgSuggestion[]> {
    const trimmed = q?.trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) return [];
    try {
      const db = await getDb();
      const r = await db.query(
        `SELECT id, complete_name, conventional_name, org_links, org_corpus, domains
           FROM organizations
           WHERE client_access CONTAINS $client
             AND (
               string::lowercase(complete_name)     CONTAINS $q
               OR string::lowercase(conventional_name) CONTAINS $q
               OR string::lowercase(slug)              CONTAINS $q
             )
           ORDER BY complete_name ASC
           LIMIT 8`,
        { client: CLIENT, q: trimmed },
      );
      return ((r?.[0] as any) ?? []) as OrgSuggestion[];
    } catch {
      return [];
    }
  }

  function pickOrg(i: number, o: OrgSuggestion) {
    if (!affiliations[i]) return;
    const cur = affiliations[i];
    affiliations[i] = {
      ...cur,
      activeOrgId:        o.id,
      completeName:       String(o.complete_name ?? cur.completeName),
      conventionalName:   String(o.conventional_name ?? cur.conventionalName),
      orgLinks:           (o.org_links ?? []) as Link[],
      orgCorpus:          (o.org_corpus ?? []) as Link[],
      orgDomains:         (o.domains   ?? []) as OrgDomain[],
      affiliationCreated: false,            // edge for THIS person still needs to be created
      autoDetectedFrom:   null,             // user-explicit choice, not auto
    };
    announce([`picked existing org (${o.complete_name ?? '(unnamed)'}) — name save will RELATE only`]);
  }

  // ---- Per-field savers — Enter on a row commits to canonical immediately.
  // Each saver also updates the `lastSaved` status line with a per-call
  // description of what was written WHERE (doc table + relational table).

  type SaveLogEntry = {
    id: string;
    at: Date;
    icon: '✓' | '✗' | '…';
    targets: string[];
    verify?: { content_id: string; url: string; verified: boolean | null };
  };
  let saveLog       = $state<SaveLogEntry[]>([]);     // stacks across this person's session
  let pendingAdvance = $state<boolean>(false);         // first Enter outside an input sets this; second confirms
  let showSummary    = $state<boolean>(false);         // "summary before advance" panel

  function onSurfaceKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName ?? '';
    const isField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (e.key === 'Enter' && !isField) {
      e.preventDefault();
      if (showSummary) {
        advance();
      } else if (pendingAdvance) {
        pendingAdvance = false;
        requestAdvance();
      } else {
        pendingAdvance = true;
      }
    } else if (e.key === 'Escape') {
      if (showSummary)    { e.preventDefault(); showSummary = false; }
      if (pendingAdvance) { e.preventDefault(); pendingAdvance = false; }
    }
  }
  function announce(targets: string[], verify?: SaveLogEntry['verify']) {
    saveLog = [...saveLog, {
      id: crypto.randomUUID(),
      at: new Date(),
      icon: '✓',
      targets,
      verify,
    }];
  }

  // Read-back verification for cross-doc writes (corpus URLs that should
  // exist in BOTH content_items and the entity's *_corpus array). The SDK
  // returns record ids in different string formats across call paths
  // (`content_items:u'…'` vs `content_items:⟨…⟩` etc.), so we compare
  // only the UUID portion. Also query by URL — the stable join key — not
  // by id, since string-matching against a record id parameter doesn't
  // always hit through the SDK serializer.
  function extractUuid(s: string): string {
    const m = String(s).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0].toLowerCase() : '';
  }
  async function verifyCorpus(content_id: string, url: string, entryId: string) {
    try {
      const db = await getDb();
      const r = await db.query(
        'SELECT id FROM content_items WHERE url = $url LIMIT 1',
        { url },
      );
      const hit = (r?.[0] as any)?.[0];
      const expected = extractUuid(content_id);
      const actual   = extractUuid(String(hit?.id ?? ''));
      const verified = !!expected && expected === actual;
      saveLog = saveLog.map((e) =>
        e.id === entryId && e.verify ? { ...e, verify: { ...e.verify, verified } } : e,
      );
    } catch {
      saveLog = saveLog.map((e) =>
        e.id === entryId && e.verify ? { ...e, verify: { ...e.verify, verified: false } } : e,
      );
    }
  }

  async function savePersonName() {
    if (!current) return;
    const db = await getDb();
    const full_name = [first_name, surname].filter(Boolean).join(' ');
    await db.query(
      `UPDATE $id SET
          first_name      = $first_name,
          surname         = $surname,
          full_name       = $full_name,
          client_access   = array::union(client_access ?? [], [$client]),
          last_touched_by = $client,
          last_touched_at = time::now();`,
      { id: current.id, first_name: first_name.trim() || null, surname: surname.trim() || null, full_name: full_name || null, client: CLIENT },
    );
    const idx = worklist[worklistIdx];
    if (idx != null) {
      allAttendees[idx] = { ...allAttendees[idx], first_name: first_name.trim() || null, surname: surname.trim() || null, full_name: full_name || null };
    }
    announce(['persons (first_name, surname, full_name)']);
  }

  async function appendEmail(email: string) {
    if (!current || !email.trim()) return;
    const db = await getDb();
    await db.query(
      `UPDATE $id SET
          emails          = array::concat(emails ?? [], [$email]),
          client_access   = array::union(client_access ?? [], [$client]),
          last_touched_by = $client,
          last_touched_at = time::now();`,
      { id: current.id, email: email.trim(), client: CLIENT },
    );
    announce(['persons.emails']);
  }

  async function appendPersonalLink(link: Link) {
    if (!current || !link.url.trim()) return;
    const db = await getDb();
    const shaped = shapeLink(link);
    await db.query(
      `UPDATE $id SET
          personal_links  = array::concat(personal_links ?? [], [$link]),
          client_access   = array::union(client_access ?? [], [$client]),
          last_touched_by = $client,
          last_touched_at = time::now();`,
      { id: current.id, link: shaped, client: CLIENT },
    );
    announce(['persons.personal_links']);
  }

  async function appendPersonalCorpus(link: Link) {
    if (!current || !link.url.trim()) return;
    const db = await getDb();
    const shaped = shapeLink(link);
    const content_id = await findOrCreateContent(db, shaped.url, shaped.kind, shaped.url_domain);
    const entry = { ...shaped, content_id };
    await db.query(
      `UPDATE $id SET
          personal_corpus = array::concat(personal_corpus ?? [], [$entry]),
          client_access   = array::union(client_access ?? [], [$client]),
          last_touched_by = $client,
          last_touched_at = time::now();`,
      { id: current.id, entry, client: CLIENT },
    );
    const entryId = crypto.randomUUID();
    saveLog = [...saveLog, {
      id: entryId, at: new Date(), icon: '…',
      targets: [`content_items (${String(content_id).slice(0, 30)}…)`, 'persons.personal_corpus'],
      verify: { content_id: String(content_id), url: shaped.url, verified: null },
    }];
    verifyCorpus(String(content_id), shaped.url, entryId).then(() => {
      saveLog = saveLog.map((e) => e.id === entryId ? { ...e, icon: e.verify?.verified ? '✓' : '✗' } : e);
    });
  }


  // ---- Save (one transaction, all dimensions) --------------------------------

  function slugify(s: string): string {
    return s
      .trim()
      .toLowerCase()
      .replace(/^the\s+/, '')                  // strip leading article — "The Institute" and "Institute" dedupe to the same slug
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  // Build a clean link object — what gets stuffed into the persons /
  // organizations document. URL, kind, derived domain, when we added it.
  function shapeLink(l: { url: string; kind: string }) {
    let url_domain = '';
    try { url_domain = new URL(l.url.trim()).hostname.toLowerCase().replace(/^www\./, ''); } catch {}
    return { url: l.url.trim(), kind: l.kind, url_domain, added_at: new Date() };
  }

  // Find-or-create a content_items row for a URL and return its id.
  // The id is shared by the relational row AND the doc-side corpus
  // array entries on persons/orgs — same URL → same UUID → entities
  // can find each other through it. Bumps reference_count + refreshes
  // last_referenced_at on every call.
  async function findOrCreateContent(
    db: any,
    url: string,
    kind: string,
    url_domain: string,
  ): Promise<string | null> {
    const existing = await db.query(
      'SELECT VALUE id FROM content_items WHERE url = $url LIMIT 1',
      { url },
    );
    const hit: string | undefined = (existing?.[0] as any)?.[0];
    if (hit) {
      await db.query(
        `UPDATE $id SET
            last_referenced_at = time::now(),
            reference_count    = (reference_count ?? 1) + 1`,
        { id: hit },
      );
      return hit;
    }
    const created = await db.query(
      `CREATE content_items SET
          id = rand::uuid::v7(),
          url = $url,
          url_domain = $url_domain,
          kind = $kind,
          first_seen_at      = time::now(),
          last_referenced_at = time::now(),
          reference_count    = 1
       RETURN id;`,
      { url, url_domain, kind },
    );
    return (created?.[0] as any)?.[0]?.id ?? null;
  }

  // ---- Per-affiliation savers ------------------------------------------------
  // Each takes an `i` parameter pointing into the affiliations[] array.

  async function ensureOrgExists(i: number): Promise<any> {
    const a = affiliations[i];
    if (!a) return null;
    const db = await getDb();

    if (a.activeOrgId) {
      if (a.completeName.trim()) {
        await db.query(
          `UPDATE $id SET
              complete_name     = $complete_name,
              conventional_name = $conventional_name,
              client_access     = array::union(client_access ?? [], [$client]),
              last_touched_by   = $client,
              last_touched_at   = time::now();`,
          { id: a.activeOrgId, complete_name: a.completeName.trim(), conventional_name: a.conventionalName.trim() || a.completeName.trim(), client: CLIENT },
        );
        announce(['organizations (refreshed names)']);
      }
      if (current && !a.affiliationCreated) {
        await db.query(
          `RELATE $person->affiliations->$org SET
              kind     = $role,
              added_at = time::now(),
              client   = $client;`,
          { person: current.id, org: a.activeOrgId, role: a.role.trim() || 'other', client: CLIENT },
        );
        affiliations[i].affiliationCreated = true;
        announce([`affiliations edge (${a.role.trim() || 'other'})`]);
      }
      return a.activeOrgId;
    }

    if (!a.completeName.trim()) return null;
    const completeName     = a.completeName.trim();
    const conventionalName = a.conventionalName.trim() || completeName;
    const slug             = slugify(completeName);
    const existing = await db.query(
      'SELECT id FROM organizations WHERE slug = $slug LIMIT 1',
      { slug },
    );
    let orgId: any = (existing?.[0] as any)?.[0]?.id ?? null;
    let created = false;
    if (!orgId) {
      const createdRes = await db.query(
        `CREATE organizations SET
            id = rand::uuid::v7(),
            slug = $slug,
            complete_name = $complete_name,
            conventional_name = $conventional_name,
            source = "person-enrichment",
            client_access = [$client],
            first_touched_by = $client,
            last_touched_by  = $client,
            last_touched_at  = time::now(),
            first_seen_at = time::now(),
            last_seen_at  = time::now()
         RETURN id;`,
        { slug, complete_name: completeName, conventional_name: conventionalName, client: CLIENT },
      );
      orgId = (createdRes?.[0] as any)?.[0]?.id ?? null;
      created = true;
    } else {
      await db.query(
        `UPDATE $id SET
            complete_name    = $complete_name,
            conventional_name= $conventional_name,
            client_access    = array::union(client_access ?? [], [$client]),
            last_touched_by  = $client,
            last_touched_at  = time::now();`,
        { id: orgId, complete_name: completeName, conventional_name: conventionalName, client: CLIENT },
      );
    }
    affiliations[i].activeOrgId = orgId;
    if (current && orgId && !affiliations[i].affiliationCreated) {
      await db.query(
        `RELATE $person->affiliations->$org SET
            kind     = $role,
            added_at = time::now(),
            client   = $client;`,
        { person: current.id, org: orgId, role: a.role.trim() || 'other', client: CLIENT },
      );
      affiliations[i].affiliationCreated = true;
      announce([
        created ? 'organizations (new row)' : 'organizations (existing)',
        `affiliations edge (${a.role.trim() || 'other'})`,
      ]);
    } else {
      announce([created ? 'organizations (new row)' : 'organizations (existing — refreshed names)']);
    }
    return orgId;
  }

  async function appendOrgLink(i: number, link: Link) {
    if (!link.url.trim()) return;
    const orgId = await ensureOrgExists(i);
    if (!orgId) return;
    const db = await getDb();
    const shaped = shapeLink(link);
    await db.query(
      `UPDATE $id SET
          org_links       = array::concat(org_links ?? [], [$link]),
          client_access   = array::union(client_access ?? [], [$client]),
          last_touched_by = $client,
          last_touched_at = time::now();`,
      { id: orgId, link: shaped, client: CLIENT },
    );
    announce(['organizations.org_links']);
  }

  async function appendOrgDomain(i: number, d: OrgDomain) {
    if (!d.domain.trim()) return;
    const orgId = await ensureOrgExists(i);
    if (!orgId) return;
    const db = await getDb();
    const entry = { domain: d.domain.trim().toLowerCase(), kind: d.kind.trim() || 'primary', added_at: new Date() };
    await db.query(
      `UPDATE $id SET
          domains         = array::concat(domains ?? [], [$entry]),
          client_access   = array::union(client_access ?? [], [$client]),
          last_touched_by = $client,
          last_touched_at = time::now();`,
      { id: orgId, entry, client: CLIENT },
    );
    announce([`organizations.domains (${entry.domain} · ${entry.kind})`]);
  }

  async function appendOrgCorpus(i: number, link: Link) {
    if (!link.url.trim()) return;
    const orgId = await ensureOrgExists(i);
    if (!orgId) return;
    const db = await getDb();
    const shaped = shapeLink(link);
    const content_id = await findOrCreateContent(db, shaped.url, shaped.kind, shaped.url_domain);
    const entry = { ...shaped, content_id };
    await db.query(
      `UPDATE $id SET
          org_corpus      = array::concat(org_corpus ?? [], [$entry]),
          client_access   = array::union(client_access ?? [], [$client]),
          last_touched_by = $client,
          last_touched_at = time::now();`,
      { id: orgId, entry, client: CLIENT },
    );
    const entryId = crypto.randomUUID();
    saveLog = [...saveLog, {
      id: entryId, at: new Date(), icon: '…',
      targets: [`content_items (${String(content_id).slice(0, 30)}…)`, 'organizations.org_corpus'],
      verify: { content_id: String(content_id), url: shaped.url, verified: null },
    }];
    verifyCorpus(String(content_id), shaped.url, entryId).then(() => {
      saveLog = saveLog.map((e) => e.id === entryId ? { ...e, icon: e.verify?.verified ? '✓' : '✗' } : e);
    });
  }


  // Click "next →" first opens the summary; second click (or Enter on confirm) advances.
  function requestAdvance() {
    if (saveLog.length > 0 && !showSummary) {
      showSummary = true;
      return;
    }
    advance();
  }
  function advance() {
    pendingAdvance = false;
    showSummary = false;
    saveLog = [];
    worklistIdx = Math.min(worklistIdx + 1, worklist.length);
    hydrateForm();
  }
  function skip()    { advance(); }
  function back()    { worklistIdx = Math.max(0, worklistIdx - 1); hydrateForm(); }

  function searchGoogle() {
    if (!current?.email) return;
    window.open(`https://www.google.com/search?q=${encodeURIComponent(current.email)}`, '_blank', 'noopener');
  }
  function searchDuck() {
    if (!current?.email) return;
    window.open(`https://duckduckgo.com/?q=${encodeURIComponent(current.email)}`, '_blank', 'noopener');
  }

  onMount(() => {
    (async () => {
      await loadEvents();
      if (eventSlug) await load();
    })();
    window.addEventListener('keydown', onSurfaceKey, true);  // capture phase
  });
  onDestroy(() => {
    window.removeEventListener('keydown', onSurfaceKey, true);
    disconnect();
  });
</script>

<div class="pe-app">
  <header class="pe-header">
    <div class="pe-event">
      <span class="pe-event-label">event</span>
      <select class="pe-event-picker" bind:value={eventSlug} onchange={onPickEvent}>
        <option value={null}>— pick an event —</option>
        {#each events as ev (ev.slug)}
          <option value={ev.slug}>{ev.name}</option>
        {/each}
      </select>
    </div>
    <div class="pe-progress">
      <span class="pe-counter">{enrichedCount} / {totalCount}</span>
      <span class="pe-counter-label">named</span>
      {#if worklist.length}
        <span class="pe-divider">·</span>
        <span class="pe-counter">{remainingInWorklist}</span>
        <span class="pe-counter-label">left</span>
      {/if}
    </div>
  </header>

  <main class="pe-body">
    {#if error}
      <div class="pe-card pe-card-error">
        <div class="pe-label">error</div>
        <pre class="pe-error">{error}</pre>
      </div>
    {/if}

    {#if loading}
      <div class="pe-card pe-card-status">{status}</div>
    {:else if !current}
      <div class="pe-card">
        <h3 class="pd-title">All done</h3>
        <p class="pe-muted">No more un-enriched attendees in the worklist.</p>
      </div>
    {:else}
      <div class="pe-card">
        <div class="pe-meta">
          {#if displayName}
            <div class="pe-meta-row">
              <span class="pe-label">name</span>
              <strong>{displayName}</strong>
            </div>
          {/if}
          {#if current.email}
            <div class="pe-meta-row">
              <span class="pe-label">email</span>
              <code class="pe-code">{current.email}</code>
            </div>
          {/if}
          {#if event?.source_url}
            <div class="pe-meta-row">
              <span class="pe-label">source</span>
              <a class="pe-link" href={event.source_url} target="_blank" rel="noopener">open source</a>
            </div>
          {/if}
          {#if current.email}
            <div class="pe-search-row">
              <button class="pe-btn pe-btn-ghost" type="button" onclick={searchGoogle}>↗ google {current.email}</button>
              <button class="pe-btn pe-btn-ghost" type="button" onclick={searchDuck}>↗ duckduckgo</button>
            </div>
          {/if}
        </div>

        <NameFields      bind:first_name bind:surname onSave={savePersonName} />
        <EmailListField  bind:emails={additional_emails} onAppend={appendEmail} />
        <LinkList        label="Personal links" bind:links={personal_links} onAppend={appendPersonalLink} />
        <LinkList        label="Personal corpus (content for LLM/RAG)" bind:links={personal_corpus} onAppend={appendPersonalCorpus} />

        <section class="pe-affiliations-section">
          <h3 class="pd-title">Affiliations <span class="pd-hint">— primary, board, advisor, past, any role</span></h3>
          {#if affiliations.length > 0}
            <div class="pe-affiliations-list">
              {#each affiliations as _aff, i (affiliations[i].uiId)}
                <AffiliationCard
                  bind:affiliation={affiliations[i]}
                  onSaveOrgName={async () => { await ensureOrgExists(i); }}
                  onAppendOrgLink={(link) => appendOrgLink(i, link)}
                  onAppendOrgCorpus={(link) => appendOrgCorpus(i, link)}
                  onAppendOrgDomain={(d) => appendOrgDomain(i, d)}
                  onLookupOrgs={lookupOrgs}
                  onPickOrg={(o) => pickOrg(i, o)}
                  onExpand={() => hydrateOrgDetail(i)}
                  onRemove={() => removeAffiliation(i)}
                />
              {/each}
            </div>
          {/if}
          <button type="button" class="pd-ghost-btn" onclick={addAffiliation}>+ add affiliation</button>
        </section>

        <div class="pe-actions">
          <button class="pe-btn pe-btn-ghost" type="button" onclick={back} disabled={worklistIdx === 0}>← back</button>
          <span class="pe-spacer"></span>
          <span class="pe-hint">Enter in a field = save it • next → reviews what you saved</span>
          <span class="pe-spacer"></span>
          <button class="pe-btn pe-btn-primary" type="button" onclick={requestAdvance}>
            next → {#if saveLog.length}({saveLog.length} writes){/if}
          </button>
        </div>

        {#if pendingAdvance && !showSummary}
          <div class="pe-confirm">
            <strong>↵ Review writes before advancing?</strong>
            Press <kbd>Enter</kbd> again to open the summary, <kbd>Esc</kbd> to cancel.
          </div>
        {/if}

        {#if showSummary}
          <div class="pe-summary">
            <div class="pe-summary-head">
              <strong>Writes for {displayName ?? current.email ?? current.id} this session</strong>
              <span class="pe-hint">{saveLog.length} entr{saveLog.length === 1 ? 'y' : 'ies'}</span>
            </div>
            <ul class="pe-summary-list">
              {#each saveLog as e (e.id)}
                <li class="pe-summary-row" data-icon={e.icon}>
                  <span class="pe-summary-icon" data-state={e.icon === '…' ? 'pending' : e.icon === '✓' ? 'ok' : 'err'}>{e.icon}</span>
                  <span class="pe-summary-time">{e.at.toLocaleTimeString()}</span>
                  <span class="pe-summary-targets">
                    {#each e.targets as t, i}
                      <code class="pe-summary-target">{t}</code>{#if i < e.targets.length - 1}<span class="pe-summary-arrow">+</span>{/if}
                    {/each}
                  </span>
                  {#if e.verify}
                    <span class="pe-summary-verify">
                      {#if e.verify.verified === null}<em>verifying…</em>
                      {:else if e.verify.verified}<span class="pe-ok-tag">cross-doc id matches</span>
                      {:else}<span class="pe-err-tag">mismatch</span>{/if}
                    </span>
                  {/if}
                </li>
              {/each}
            </ul>
            <div class="pe-summary-actions">
              <button class="pe-btn pe-btn-ghost" type="button" onclick={() => showSummary = false}>← keep editing</button>
              <span class="pe-spacer"></span>
              <button class="pe-btn pe-btn-primary" type="button" onclick={advance}>
                confirm + next →
              </button>
            </div>
          </div>
        {/if}

        {#if saveLog.length > 0 && !showSummary}
          <ul class="pe-savelog-stack">
            {#each saveLog as e (e.id)}
              <li class="pe-savelog-row">
                <span class="pe-savelog-icon" data-state={e.icon === '…' ? 'pending' : e.icon === '✓' ? 'ok' : 'err'}>{e.icon}</span>
                <span class="pe-savelog-time">{e.at.toLocaleTimeString()}</span>
                <span class="pe-savelog-targets">
                  {#each e.targets as t, i}
                    <code>{t}</code>{#if i < e.targets.length - 1}<span> + </span>{/if}
                  {/each}
                </span>
                {#if e.verify && e.verify.verified}<span class="pe-ok-tag">cross-doc ✓</span>{/if}
                {#if e.verify && e.verify.verified === false}<span class="pe-err-tag">mismatch</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      {#if status}
        <div class="pe-card pe-card-status">{status}</div>
      {/if}
    {/if}
  </main>
</div>
