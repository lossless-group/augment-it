# Reminders

* [Libraries We Do Not Use — Ever](Libraries-we-Do-Not-Use-Ever.md) - A hard denylist of packages this codebase has removed on purpose. Do not import them, do not assume they are installed, do not re-add them.
* [Pickup notes — 2026-05-23](Pickup-2026-05-23.md) - All four enrichment-pipeline remotes are built with working UIs, and nothing has been run end to end. Smoke-test before building anything.
* [Pickup notes — 2026-05-27](Pickup-2026-05-27.md) - The packs-and-bundles arc closed clean; three new docs name the next arcs — Run-as-First-Class, search providers, agent-chat verbs.
* [Pickup notes — 2026-06-01](Pickup-2026-06-01.md) - The shell UX-coherence spec is Draft with 8 locked decisions — and explicitly held at the sign-off gate. Do not implement before sign-off.
* [Pickup notes — 2026-06-02](Pickup-2026-06-02.md) - Four interlocking Entity Pulse specs landed, all still Draft — nothing implemented. OfficialUpdates ships first and gates the rest.
* [Pickup notes — 2026-06-03](Pickup-2026-06-03.md) - Records Surface at :3011 landed in the Flow at step 3 with three connectors, and the 96-row tracker promoted v5 to v6 end-to-end.
* [Pickup — Build the Enhanced Records List + Promotion Checkpoint](Pickup-Enhanced-Records-List-Build.md) - The enhanced-records-list spec is finished; next session's first build step is the `record_uuid` plumbing and backfill.
* [Record Count Stays Stable Across Versions — Augmenting Adds Columns, Never Rows](Record-Count-Stays-Stable-Across-Versions.md) - One dataset, one row count, forever — augmenting adds columns, not rows. 231 rows in the store for a 96-record dataset is a symptom.
* [Tags Are Two Projections — Frontmatter `tags:` on Files, `has_tag` Observations in SurrealDB](Tags-Are-Two-Projections-Frontmatter-and-Has-Tag-Observations.md) - Files say `tags:` because Obsidian reads files; the DB says `has_tag` because its predicates are verb-shaped. Same fact, two projections.
