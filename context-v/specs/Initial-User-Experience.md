---
title: "Initial User Experience — From Landing to a Productive First Action"
lede: "What does the first thirty seconds of augment-it feel like? This spec covers the surface a brand-new user lands on, the lightweight onboarding that gets them to a productive first action without lecturing, and the seams where the working-app and architecture-demonstration identities first meet the visitor. Designed to be skipped by returning users, never re-shown unnecessarily, and never required to dismiss to do work."
date_created: 2026-06-01
date_modified: 2026-06-01
authors:
  - Michael Staton
augmented_with:
  - Claude Code on Claude Opus 4.7 (1M context)
semantic_version: 0.0.0.1
tags:
  - Spec
  - Augment-It
  - Onboarding
  - Initial-User-Experience
  - First-Use
  - UX
  - Discoverability
status: Draft
---

# Initial User Experience

<!-- developing — stub captured 2026-06-01. The shape this should cover:
       - what loads at http://localhost:3100 (or the deployed equivalent)
         for a user with no session and no record sets;
       - the minimal onboarding (skippable, never blocking, never re-shown
         once skipped) that points at the Flow widget and the first step;
       - the seam where the dual identity surfaces (do we offer the
         "see the architecture" reveal up front, or only via the per-remote
         API-docs CTA from [[API-First-In-App-Documentation]]?);
       - the auth gate's first impression (informed by
         [[../blueprints/Auth-Patterns-following-Astro-Knots-Patterns]]).
     Body to develop with the user. -->

## Related

- [[Shell-and-Micro-Frontend-UX-Coherence]] — the coherence principles
  this onboarding has to instance (no Hidden/Dead/Mismatched/Misnamed
  affordances on first contact, of all places)
- [[../blueprints/Augment-It-as-Working-App-and-Architecture-Demo]] —
  the dual identity that shapes who "the new user" actually is
- [[../blueprints/Auth-Patterns-following-Astro-Knots-Patterns]] —
  the auth gate is part of the first 30 seconds; the patterns it follows
  matter to this spec
- [[API-First-In-App-Documentation]] — the in-app docs reveal is one
  candidate first-touch with the architecture-demo identity
- [[Augment-It-as-CRM-Augmentation-Pipeline]] — the working-app vision
  the onboarding has to make legible
