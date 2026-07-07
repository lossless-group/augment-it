// Flows — which top-level use-case the shell is presenting right now.
//
// Per context-v/explorations/Augment-It-Has-Outgrown-One-Flow-The-Choose-A-Flow-Front-Door.md:
// the old bare `ROTATION` constant was trying to be two things at once —
// the CSV-row-augmentation pipeline's step order AND "the" numbered nav
// for the whole shell. Those split here: each Flow owns its own rotation
// (an ordered list of slot ids, same shape `ROTATION` always was), and
// ActiveFlow picks which one FlowWidget / App.svelte walk. Adding a flow
// is a new FLOWS entry + a rotation array in remotes.ts — nothing else.
//
// Svelte 5 singleton, same constructor-assignment $state pattern as
// @augment-it/workspace and ./layout.svelte (so toolchain class-field
// lowering can't break $state placement).

import {
  CSV_AUGMENTATION_ROTATION,
  BUILD_CORPORA_ROTATION,
  EVENT_ATTENDEES_ROTATION,
  PEOPLE_ROTATION,
  AFFILIATION_RATING_ROTATION,
} from './remotes';

export type FlowDef = {
  id: string;
  label: string;
  description: string;
  rotation: string[];
};

export const FLOWS: FlowDef[] = [
  {
    id: 'csvAugmentation',
    label: 'Improve a CSV',
    description:
      'Upload records, augment them with prompts and connector packs, review responses, promote a checkpoint. The original multi-step pipeline.',
    rotation: CSV_AUGMENTATION_ROTATION,
  },
  {
    id: 'buildCorpora',
    label: 'Build Corpora',
    description:
      'Pick a strategy or thesis and gather sources for it — the domain-first corpus workflow (feeds dididecks-ai downstream).',
    rotation: BUILD_CORPORA_ROTATION,
  },
  {
    id: 'eventAttendees',
    label: 'Augment a CSV of Event Attendees',
    description:
      'Ingest an event-attendee CSV and reconcile each row to a canonical organization in SurrealDB — the CRM-replacement workflow. For a CSV of people, use "Augment a CSV of People" instead.',
    rotation: EVENT_ATTENDEES_ROTATION,
  },
  {
    id: 'people',
    label: 'Augment a CSV of People',
    description:
      'Ingest a CSV of people (event speakers, attendees) and reconcile each row to a canonical person, then their org + role, in SurrealDB.',
    rotation: PEOPLE_ROTATION,
  },
  {
    id: 'affiliationRating',
    label: 'Rate Affiliations',
    description:
      'Reimport a relevance-rated affiliations CSV (from scripts/export-affiliation-ratings-csv.mjs) and write the ratings back onto each affiliations edge in SurrealDB. The first flow that starts from the canonical layer instead of a raw CSV.',
    rotation: AFFILIATION_RATING_ROTATION,
  },
];

const STORAGE_KEY = 'augment-it:active-flow';
const DEFAULT_FLOW_ID = FLOWS[0].id;

function readStored(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_FLOW_ID;
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw && FLOWS.some((f) => f.id === raw) ? raw : DEFAULT_FLOW_ID;
}

class ActiveFlowState {
  activeFlowId: string;

  constructor() {
    this.activeFlowId = $state<string>(readStored());
  }

  get flow(): FlowDef {
    return FLOWS.find((f) => f.id === this.activeFlowId) ?? FLOWS[0];
  }

  /** The active flow's rotation — what ROTATION used to be, dynamically. */
  get rotation(): string[] {
    return this.flow.rotation;
  }

  setActiveFlow(id: string): void {
    if (id === this.activeFlowId || !FLOWS.some((f) => f.id === id)) return;
    this.activeFlowId = id;
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  }
}

export const activeFlow = new ActiveFlowState();
