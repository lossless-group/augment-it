// Group H — Chat curation verbs: the "Existing corpora" slab.
// Registry: context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
//
// Test names are the registry's ✓-phrases, verbatim. The capability
// dispatch and NATS layers are mocked out — these tests pin the slab's
// contract: didi sees every corpus in the workspace regardless of type,
// and a resolver failure degrades to an empty slab, never a dead turn.

import { beforeEach, describe, expect, test, vi } from 'vitest';

const dispatchMock = vi.fn();

vi.mock('../src/capabilities', () => ({
  dispatch: (...args: unknown[]) => dispatchMock(...args),
}));
vi.mock('../src/nats', () => ({
  getNats: () => {
    throw new Error('NATS must not be touched by slab assembly tests');
  },
}));
vi.mock('../src/workspaces', () => ({
  getActiveClientId: () => 'humain-vc',
}));

import { existingCorporaSlab } from '../src/chat';

beforeEach(() => {
  dispatchMock.mockReset();
});

describe('Group H — chat curation verbs', () => {
  test("the chat prompt's \"Existing corpora\" slab lists every domain in the active workspace, all types", async () => {
    dispatchMock.mockResolvedValue({
      domains: [
        { type: 'thesis', slug: 'consumer-immunology', title: 'Consumer Immunology' },
        { type: 'thesis', slug: 'specialized-foundation-models', title: 'Specialized Foundation Models' },
        { type: 'strategy', slug: 'rural-income-boosts', title: 'Rural Income Boosts' },
        { type: 'topic', slug: 'future-of-work', title: 'Future of Work' },
      ],
    });

    const slab = await existingCorporaSlab('humain-vc');

    // The dispatch is UNFILTERED by type — that is the load-bearing
    // difference from the curator rail's typed query.
    expect(dispatchMock).toHaveBeenCalledWith('domain.list', { client_slug: 'humain-vc' });
    expect(slab).toContain('Consumer Immunology → thesis:consumer-immunology');
    expect(slab).toContain('Rural Income Boosts → strategy:rural-income-boosts');
    expect(slab).toContain('Future of Work → topic:future-of-work');
    expect(slab).toContain('Specialized Foundation Models → thesis:specialized-foundation-models');
  });

  test('when domain.list fails, the slab is omitted and the turn still completes', async () => {
    dispatchMock.mockRejectedValue(new Error('resolver is down'));

    // Completing = resolving to a string, never throwing.
    await expect(existingCorporaSlab('humain-vc')).resolves.toBe('');

    // And a workspace-less session never even dispatches.
    dispatchMock.mockReset();
    await expect(existingCorporaSlab(null)).resolves.toBe('');
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
