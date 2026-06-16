<script lang="ts">
  // PULSE-SURFACE for the person-enrichment remote.
  //
  // A pulse-surface hosts ONE entity at a time and composes N
  // pulse-dimensions against it (name, socials, additional emails,
  // organization, web presence). The operator works through the
  // worklist of un-enriched attendees for ONE event, and each pulse —
  // one search burst per attendee — fills as many dimensions as the
  // search surfaces.
  //
  // v0 hardcodes the Turning-Jobs-Into-Degrees event; event-picker is
  // a later slice. v0 also talks directly to SurrealDB; later slices
  // proxy through per-dimension services.

  import { onMount, onDestroy } from 'svelte';
  import { getDb, disconnect, CLIENT } from './lib/surreal';
  import type { Person, EventRow, Link } from './lib/types';

  import NameFields      from './pulse-dimensions/NameFields.svelte';
  import EmailListField  from './pulse-dimensions/EmailListField.svelte';
  import OrgCreate       from './pulse-dimensions/OrgCreate.svelte';
  import LinkList        from './pulse-dimensions/LinkList.svelte';

  const EVENT_SLUG = '2026-05-21-turning-jobs-into-degrees';
  const RSVP_PREDICATES = ['invited_to', 'visited_event_page', 'email_bounced'] as const;

  // ---- State -----------------------------------------------------------------

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
  let org_complete_name    = $state('');
  let org_conventional     = $state('');
  let org_links            = $state<Link[]>([]);   // org's identity URLs
  let org_corpus           = $state<Link[]>([]);   // content the org publishes

  const current = $derived(
    worklistIdx >= 0 && worklistIdx < worklist.length
      ? allAttendees[worklist[worklistIdx]]
      : null,
  );

  const enrichedCount = $derived(allAttendees.filter((p) => p.full_name).length);
  const totalCount    = $derived(allAttendees.length);
  const remainingInWorklist = $derived(Math.max(0, worklist.length - worklistIdx));

  // ---- Load ------------------------------------------------------------------

  async function load() {
    loading = true; error = null; status = 'connecting…';
    try {
      const db = await getDb();

      status = 'loading event…';
      const evResult = await db.query(
        'SELECT * FROM events WHERE slug = $slug LIMIT 1',
        { slug: EVENT_SLUG },
      );
      const ev = (evResult?.[0] as any)?.[0];
      if (!ev) throw new Error(`event ${EVENT_SLUG} not found`);
      event = ev;

      status = 'loading attendees…';
      const peopleResult = await db.query(
        `SELECT * FROM persons
           WHERE id IN (
             SELECT VALUE subject FROM observations
               WHERE object = $event_id AND predicate IN $preds
           )
           ORDER BY first_seen_at ASC`,
        { event_id: ev.id, preds: RSVP_PREDICATES },
      );
      allAttendees = ((peopleResult?.[0] as any[]) || []) as Person[];

      worklist = allAttendees
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => !p.full_name)
        .map(({ i }) => i);
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

  let activeOrgId        = $state<string | null>(null);
  let autoDetectedFrom   = $state<'email_domain' | 'previous_affiliation' | null>(null);
  let affiliationCreated = $state<boolean>(false);  // once-per-session — guards against duplicate edges

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
    org_complete_name    = '';
    org_conventional     = '';
    org_links            = [];
    org_corpus           = [];
    activeOrgId          = null;
    autoDetectedFrom     = null;
    affiliationCreated   = false;
    // Auto-detect runs in the background and pre-fills the org section
    // when we recognize the person (existing affiliation) or their email
    // domain (matches a known org's links/corpus).
    void autoDetectOrg();
  }

  async function autoDetectOrg() {
    if (!current) return;
    const db = await getDb();

    // 1. Already affiliated from a previous session? Use that org.
    try {
      const r = await db.query(
        `SELECT ->affiliations->organizations.* AS orgs FROM $id`,
        { id: current.id },
      );
      const orgs = ((r?.[0] as any)?.[0]?.orgs ?? []) as any[];
      if (orgs.length > 0) {
        const o = orgs[0];
        org_complete_name  = o.complete_name     ?? '';
        org_conventional   = o.conventional_name ?? '';
        activeOrgId        = String(o.id);
        affiliationCreated = true;  // already exists
        autoDetectedFrom   = 'previous_affiliation';
        return;
      }
    } catch { /* fall through to email-domain heuristic */ }

    // 2. Email-domain match against existing orgs' links/corpus.
    const domain = current.email?.split('@')[1]?.toLowerCase().replace(/^www\./, '');
    if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return;
    try {
      const r = await db.query(
        `SELECT * FROM organizations
           WHERE client_access CONTAINS $client
             AND (
               $domain IN org_links.*.url_domain
               OR $domain IN org_corpus.*.url_domain
             )
           LIMIT 1`,
        { client: CLIENT, domain },
      );
      const o = (r?.[0] as any)?.[0];
      if (o) {
        org_complete_name  = o.complete_name     ?? '';
        org_conventional   = o.conventional_name ?? '';
        activeOrgId        = String(o.id);
        autoDetectedFrom   = 'email_domain';
      }
    } catch { /* no match, leave empty */ }
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

  async function ensureOrgExists(): Promise<string | null> {
    if (activeOrgId) {
      // Refresh names if operator edited them
      const db = await getDb();
      if (org_complete_name.trim()) {
        await db.query(
          `UPDATE $id SET
              complete_name     = $complete_name,
              conventional_name = $conventional_name,
              client_access     = array::union(client_access ?? [], [$client]),
              last_touched_by   = $client,
              last_touched_at   = time::now();`,
          { id: activeOrgId, complete_name: org_complete_name.trim(), conventional_name: org_conventional.trim() || org_complete_name.trim(), client: CLIENT },
        );
        announce(['organizations (refreshed names)']);
      }
      // Auto-detected orgs need an affiliation edge for THIS person on
      // the first commit — confirms that this person is affiliated with
      // the pre-filled org. Only fires once per session.
      if (current && !affiliationCreated) {
        await db.query(
          `RELATE $person->affiliations->$org SET
              kind     = "operator-confirmed",
              added_at = time::now(),
              client   = $client;`,
          { person: current.id, org: activeOrgId, client: CLIENT },
        );
        affiliationCreated = true;
        announce(['affiliations edge (persons→organizations)']);
      }
      return activeOrgId;
    }
    if (!org_complete_name.trim()) return null;
    const db = await getDb();
    const completeName     = org_complete_name.trim();
    const conventionalName = org_conventional.trim() || completeName;
    const slug             = slugify(completeName);
    const existing = await db.query(
      'SELECT id FROM organizations WHERE slug = $slug LIMIT 1',
      { slug },
    );
    let orgId: string | null = (existing?.[0] as any)?.[0]?.id ?? null;
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
    activeOrgId = orgId;
    if (current && orgId && !affiliationCreated) {
      await db.query(
        `RELATE $person->affiliations->$org SET
            kind     = "operator-confirmed",
            added_at = time::now(),
            client   = $client;`,
        { person: current.id, org: orgId, client: CLIENT },
      );
      affiliationCreated = true;
      announce([
        created ? 'organizations (new row)' : 'organizations (existing)',
        'affiliations edge (persons→organizations)',
      ]);
    } else {
      announce([created ? 'organizations (new row)' : 'organizations (existing — refreshed names)']);
    }
    return orgId;
  }

  async function appendOrgLink(link: Link) {
    if (!link.url.trim()) return;
    const orgId = await ensureOrgExists();
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

  async function appendOrgCorpus(link: Link) {
    if (!link.url.trim()) return;
    const orgId = await ensureOrgExists();
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

  // ---- Save (one transaction, all dimensions) --------------------------------

  function slugify(s: string): string {
    return s
      .toLowerCase()
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
    load();
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
      <span class="pe-event-name">{event?.name ?? '—'}</span>
    </div>
    <div class="pe-progress">
      <span class="pe-counter">{enrichedCount} / {totalCount}</span>
      <span class="pe-counter-label">enriched</span>
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
          <div class="pe-meta-row">
            <span class="pe-label">email</span>
            <code class="pe-code">{current.email ?? '—'}</code>
          </div>
          {#if event?.source_url}
            <div class="pe-meta-row">
              <span class="pe-label">source</span>
              <a class="pe-link" href={event.source_url} target="_blank" rel="noopener">open gatsby table</a>
            </div>
          {/if}
          <div class="pe-search-row">
            <button class="pe-btn pe-btn-ghost" type="button" onclick={searchGoogle}>↗ google {current.email}</button>
            <button class="pe-btn pe-btn-ghost" type="button" onclick={searchDuck}>↗ duckduckgo</button>
          </div>
        </div>

        <NameFields      bind:first_name bind:surname onSave={savePersonName} />
        <EmailListField  bind:emails={additional_emails} onAppend={appendEmail} />
        <LinkList        label="Personal links" bind:links={personal_links} onAppend={appendPersonalLink} />
        <LinkList        label="Personal corpus (content for LLM/RAG)" bind:links={personal_corpus} onAppend={appendPersonalCorpus} />

        {#if autoDetectedFrom}
          <div class="pe-auto-detect">
            ✓ Org pre-filled
            {#if autoDetectedFrom === 'previous_affiliation'}
              <span>— this person is already affiliated with</span>
              <strong>{org_complete_name}</strong>
              <span>(loaded from canonical)</span>
            {:else}
              <span>— matched email domain</span>
              <code>{current.email?.split('@')[1]}</code>
              <span>→</span>
              <strong>{org_complete_name}</strong>
              <span>· Enter on name to confirm the affiliation, or edit to change</span>
            {/if}
          </div>
        {/if}

        <OrgCreate       bind:complete_name={org_complete_name}
                         bind:conventional_name={org_conventional}
                         bind:org_links
                         bind:org_corpus
                         onSaveOrgName={async () => { await ensureOrgExists(); }}
                         onAppendOrgLink={appendOrgLink}
                         onAppendOrgCorpus={appendOrgCorpus} />

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
              <strong>Writes for {current.full_name ?? current.email} this session</strong>
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
