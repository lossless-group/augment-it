---
title: "Didi chat joins the Org Workbench — first agent action: verify a team page and turn it into approved people objects"
lede: "Integrate the didi chat rail with the Org Workbench so agents can take view-scoped actions. The proving action: point didi at an organization's team page; it returns people objects INTO STATE (not the DB), the user alters or verifies them on the card, and only on approval does the agent write person + affiliation records — to SurrealDB, or CSV, or whatever backend the workspace is using."
date_created: 2026-07-24
date_modified: 2026-07-24
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Fable 5
semantic_version: 0.0.0.2
tags:
  - Plan
  - Augment-It
  - Org-Workbench
  - Didi-Chat
  - Agent-Actions
  - Team-Page
  - Persons
  - Affiliations
status: Draft · Stub
---

# Didi chat in the Org Workbench — team page → people objects

<!-- stub — captured 2026-07-24 from the operator's dictation; to be
developed before execution. Sequenced AFTER the jotted usability issues
or alongside them; not yet slotted against a spec. -->

## The ask, verbatim-adjacent

1. Integrate didi chat into the Org Workbench view so agents can take
   certain actions scoped to what the operator is looking at.
2. The proving action: **verify the team page of an organization** —
   didi fetches/parses it and returns **people objects in STATE**,
   presented on/next to the card.
3. The user **alters or verifies** the staged people (names, roles,
   dedupe against candidates).
4. **On approval**, the agent creates the person objects — and their
   affiliations to the org — in the DB instance (or CSV if that's the
   active backend) for everyone on that team page.

## Prior art this composes (don't reinvent)

- **Chat verb registry + propose/approve gating** —
  `services/workspace/src/chat.ts` (`chat_answer` / `chat_propose` /
  `chat_invoke`); the CURATOR_CHAT_VERBS slab is the template for an
  ORG_WORKBENCH_CHAT_VERBS sibling. The propose step IS the approval
  gate this flow needs.
- **The write path exists end-to-end** — `person.candidates` →
  `person.apply` → `person.affiliate` (N-per-person, org pre-bound,
  observations ride along). The agent loops it per approved row; nothing
  new below the capability line except maybe a batch wrapper.
- **Team-page parsing** — the `crawl-fetch-ingest` skill's
  firm-anchored cascade (team pages → people + headshots + LinkedIn
  URLs) is the extraction playbook; Firecrawl/Jina are already wired.
- **Staged-state-then-approve** — the Response Reviewer triage model and
  the AddPersonInline candidate gate are the UI grammar: staged rows,
  per-row accept/edit/skip, batch approve.
- **Chat rail is already adjacent** — the shell mounts chat as the
  persistent left rail; "didi knows what card you're on" needs the
  active-entity context (org_slug) in the chat envelope, akin to the
  active-client context the inbox verb already carries.

## Rough shape (to be developed)

1. Context plumbing: org-workbench broadcasts its active org
   (`augment-it:active-entity` or a workspace frame) → chat includes it.
   **SHIPPED 2026-07-24 (014db0a, ahead of this plan):** the event +
   localStorage broadcast, `focused_org_slug`/`focused_org_name` on every
   chat_turn, the context slab's "this org" resolution, and bare
   `/crawl-*` targeting the focused org.
2. Verb: `org.team_page.scan` (propose-shaped) — surfaced to the operator
   as *"crawl for relevant team members"* (the third crawl target in
   [[../specs/Augment-From-DB-Flow]] §v1.2 — chat verb AND button). Input:
   team-page URL (from org_links, operator-pasted, or the agent FINDS it —
   the identifier half); output: staged
   `people: [{name, role, headline?, linkedin?, bio_url}]` in state.
   **Selection rides the relevance brief's people policy** — default:
   all major leadership, plus all team members covering Education &
   Workforce Development and related strategies/topics; the agent stages
   the selected set (with a "N others on the page filtered by policy"
   note so the filter is visible, not silent).
3. Staging UI on the workbench: the people reveal grows a "staged"
   section (distinct chrome) with per-row edit/verify/skip.
4. Approval → batch `person.candidates/apply/affiliate` with
   per-row candidate gates ONLY where matches are ambiguous
   (exact-no-candidates rows can flow; the gate-every-step thesis
   applies to writes, and approval WAS the gate).
5. Provenance: every created person's observation cites the team-page
   URL as source.

## Open questions (for the development pass)

- [ ] Where does staged state live — org-workbench runes state, a
  workspace frame (survives remount), or chat-turn state?
- [ ] Ambiguous-match policy: inline per-row gates vs. kick ambiguous
  rows to AddPersonInline?
- [ ] "or CSV" — does the record-set backend variant matter for v1, or
  is canonical-DB-only acceptable first?
- [ ] Relationship to [[../issues/Person-Bio-Pages-Are-Affiliation-Signals-Not-Just-Identity-Links]]
  — the team-page scan mass-produces exactly the promotion that issue
  wants one-at-a-time.
- [ ] Does this want a spec first (it crosses chat + workbench + state
  staging), or is it plan-sized? Leaning: small spec, per the
  developing-a-spec rhythm — this stub is the pre-spec capture.
