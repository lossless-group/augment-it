// Mock pack-shaped responses for smoke-testing the structured-output extension.
// Loaded when Response Reviewer's URL has `?fixture=mock-packs`. These records
// are NEVER persisted — they're prepended to the in-memory responses array so
// the user can see every outcome+confidence band side-by-side without
// polluting response-store data.
//
// Spec: context-v/prompts/Response-Reviewer-Structured-Output-Extension.md
//       context-v/blueprints/Packs-and-Bundles-Pattern.md

import type { ResponseRecord } from '@augment-it/workspace';

const NOW = '2026-05-25T00:00:00Z';

// Each mock uses a `_mock_` row/prompt/record-set id prefix so they sort
// together and can't collide with anything real.
const baseMock = (
  i: number,
  overrides: Partial<ResponseRecord>,
): ResponseRecord => ({
  response_id: `rsp_mock_${i}`,
  run_id: 'run_mock',
  prompt_id: 'prompt_mock_profile_builder',
  row_id: 'row_mock_acme_foundation',
  record_set_id: 'rs_mock_pipeline',
  output_column: 'profiles',
  model: 'mock',
  request_body: { mock: true },
  response_text: '',
  edited_text: null,
  flag: null,
  accepted: false,
  created_at: NOW,
  reviewed_at: null,
  edited_at: null,
  outcome: 'found',
  structured: null,
  archival_markdown: null,
  pack_id: null,
  bundle_id: 'profile-builder.common',
  pass: 1,
  ...overrides,
});

export const MOCK_PACKS_FIXTURE: ResponseRecord[] = [
  // Three `found` candidates spanning the confidence bands.
  baseMock(1, {
    response_id: 'rsp_mock_found_high',
    response_text:
      'Found a verified LinkedIn profile for Acme Foundation. Strong signal: exact name match, employer hint matches the row, profile has >500 connections and recent activity.',
    outcome: 'found',
    pack_id: 'linkedin-pack-mock',
    structured: {
      url: 'https://www.linkedin.com/company/acme-foundation',
      display_name: 'Acme Foundation',
      confidence: 87,
      snippet:
        'Acme Foundation · 12,400 followers · Philanthropy · We invest in early-stage education programs across the southwest US.',
      source_metadata: { followers_band: '10k-50k', verified: true },
    },
  }),
  baseMock(2, {
    response_id: 'rsp_mock_found_med',
    response_text:
      'Found a possible LinkedIn profile. Name matches but the employer hint does not — could be a different Acme.',
    outcome: 'found',
    pack_id: 'linkedin-pack-mock',
    structured: {
      url: 'https://www.linkedin.com/company/acme-corp',
      display_name: 'Acme Corp',
      confidence: 55,
      snippet:
        'Acme Corp · 230 followers · Software · Tools for makers and small workshops.',
      source_metadata: { followers_band: '<1k', verified: false },
    },
  }),
  baseMock(3, {
    response_id: 'rsp_mock_found_low',
    response_text:
      'Low-confidence match. Name fragment overlap only; no other corroborating signal.',
    outcome: 'found',
    pack_id: 'candid-pack-mock',
    structured: {
      url: 'https://www.candid.org/profile/14-1234567',
      display_name: 'A.C.M.E. Trust',
      confidence: 22,
      snippet: 'IRS Form 990 filer · EIN 14-1234567 · Last filing 2021.',
      source_metadata: { ein: '14-1234567', stale_filing: true },
    },
  }),
  baseMock(4, {
    response_id: 'rsp_mock_not_found',
    response_text: '',
    outcome: 'not_found',
    pack_id: 'bluesky-pack-mock',
  }),
  baseMock(5, {
    response_id: 'rsp_mock_error',
    response_text: 'Rate limited by upstream (429). Retry after 30s.',
    outcome: 'error',
    pack_id: 'youtube-pack-mock',
  }),
  baseMock(6, {
    response_id: 'rsp_mock_skipped',
    response_text: '',
    outcome: 'skipped',
    pack_id: 'linkedin-pack-mock',
    flag: 'good',
    structured: {
      url: 'https://www.linkedin.com/company/acme-foundation',
      display_name: 'Acme Foundation',
      confidence: 100,
      snippet: 'Carried forward from existing helpful_links — already verified.',
    },
  }),
  baseMock(7, {
    response_id: 'rsp_mock_pending',
    response_text: '',
    outcome: 'pending',
    pack_id: 'x-pack-mock',
  }),
];
