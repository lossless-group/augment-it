---
title: "API-First In-App Documentation — Each Surface Reveals Its Own Docs Inline"
lede: "Every remote, the shell, and every service ships its documentation inside itself — toggled by a small icon-CTA, revealed inline within the surface rather than in a separate tab. Not generic API docs but relevant ones: the data flowing in, the services called with which payloads, the response shapes, the diagrams. Because augment-it is also a demonstration of API-first architecture, the docs are part of the product, not adjacent to it."
date_created: 2026-06-01
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7
semantic_version: 0.0.0.1
tags:
  - Spec
  - Augment-It
  - API-First
  - Documentation
  - In-App-Docs
  - Microfrontends
  - Microservices
  - Architecture-Demonstration
  - Discoverability
status: Draft
---

# API-First In-App Documentation

<!-- developing — stub captured 2026-06-01 from the Shell-and-Micro-Frontend-
     UX-Coherence spec's Wish-list section. Motivated by the architecture-
     demonstration identity (see [[../blueprints/Augment-It-as-Working-App-
     and-Architecture-Demo]]). Body to develop with the user. -->

## Related

- [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] — the
  dual-identity framing that motivates this feature
- [[Shell-and-Micro-Frontend-UX-Coherence]] — parent spec where this
  feature was first named (§ Wish list); the icon-with-tooltip toggle
  pattern (Decisions §5, §8) is the affordance this reuses
- [[../plans/Run-as-First-Class-Operation]] — the Run entity is a natural
  candidate for inline data-flow documentation
- [[../blueprints/Module-Federation-Rsbuild-Dev-Loop-Gotchas]] — the
  federation mechanics each remote's docs should make legible
- [[../blueprints/Packs-and-Bundles-Pattern]] — Pack Runner's docs should
  ground in this pattern
