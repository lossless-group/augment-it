---
title: "Auth Patterns — Following Astro Knots Conventions in a Rsbuild + Module-Federation Shell"
lede: >-
  Astro Knots auth rules translated to Rsbuild + NATS: the middleware gate becomes a WS token check, and silent bypass is the shared risk.
date_created: 2026-06-01
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
tags:
  - Blueprint
  - Augment-It
  - Astro-Knots
  - Auth
  - Session
  - Middleware
  - Module-Federation
  - Architecture
status: Draft
site_uuid: 40f18f7e-a4e7-45df-a2df-ef72d7bb06ca
hex_code: aspt35
date_authored_initial_draft: 2026-06-01
date_authored_current_draft: 2026-06-01
publish: false
---

# Auth Patterns — Following Astro Knots Conventions

<!-- developing — stub captured 2026-06-01. Topics this blueprint needs to
     name when its body is written:

     - WHAT EXISTS: services/workspace-service holds `sessions.json` (auth
       tokens, surfaced in scripts/backup-stores.sh as sensitive). The shell
       and remotes consume tokens via the workspace WebSocket.
     - WHAT TRANSLATES from Astro Knots: session-cookie discipline; the
       public allowlist concept (which surfaces are reachable pre-auth);
       the "no silent bypass" principle behind the Astro Knots rule about
       gated routes never being prerendered.
     - WHAT DOESN'T TRANSLATE LITERALLY: there's no Astro middleware
       because the shell is Rsbuild, not Astro. The equivalent gate is
       the workspace-service's token check on WS upgrade + per-capability
       authorization. Prerender-vs-SSR isn't a concern; the failure mode
       it prevents (CDN serving a gated route around the gate) doesn't
       apply.
     - THE SHARED FAILURE FAMILY: silent bypass in either stack means a
       gate that *looks* present but doesn't run on every request. In
       Astro Knots that's prerender=true under middleware; in augment-it
       it's any new capability handler that forgets the per-request auth
       check.
     - INITIAL-USER-EXPERIENCE TIE-IN: the auth gate is part of the first
       30 seconds — see [[../specs/Initial-User-Experience]].

     Body to develop with the user. Cross-reference the Astro Knots skill
     reference at calmstorm-decks middleware and dididecks-ai/changelog/
     2026-05-17_02.md (the auth-loop debugging trace) once developed. -->

## Related

- [[../specs/Initial-User-Experience]] — the auth gate is the first
  surface the new user touches
- [[Augment-It-as-Working-App-and-Architecture-Demo]] — the auth pattern
  is *itself* one of the things the architecture-demo identity should
  make legible
- [[Module-Federation-Rsbuild-Dev-Loop-Gotchas]] — federation mechanics
  the workspace-token discipline rides on
- [[../specs/Shell-and-Micro-Frontend-UX-Coherence]] — auth affordances
  belong to the same coherence audit (no Hidden/Dead/Misnamed gates)
- The `astro-knots` skill's *Auth-gated routes must not be prerendered*
  section is the canonical Astro Knots reference; once a referenceable
  blueprint exists in the parent monorepo, link it from here
