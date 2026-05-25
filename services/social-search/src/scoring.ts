// Confidence scoring. Pure functions; no side effects. Returns 0-100.
//
// Baseline (from the prompt):
//   Tier-1 URL-shape match:           +60
//   Display-name exact-match:         +30
//   Display-name fuzzy-match:         +15
//   Recent activity (within 12 mo):   +10
//   Multiple distinct candidates from
//     the same domain (ambiguity):    cap at 60
//
// Spec: context-v/prompts/Common-Six-Social-Packs.md §Confidence scoring

import type { TavilyResult } from './tavily';

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter((t) => t.length > 1);
}

/**
 * Score one candidate (the chosen top result) against the search context.
 *
 * `siblings_from_same_domain` is the count of OTHER results from the same
 * hostname Tavily returned. Many sibling candidates = ambiguity = lower
 * ceiling on confidence.
 */
export function scoreCandidate(args: {
  tier_1_match: boolean;
  entity_name: string;
  candidate_title: string;
  candidate_published_date?: string;
  siblings_from_same_domain: number;
}): number {
  let score = 0;

  if (args.tier_1_match) score += 60;

  const want = normalize(args.entity_name);
  const got = normalize(args.candidate_title);

  if (want.length > 0 && got.length > 0) {
    if (got === want || got.startsWith(want) || got.includes(` ${want} `) || got.endsWith(want)) {
      score += 30;
    } else {
      // Fuzzy: token overlap. 50%+ shared tokens (by count) is a fuzzy match.
      const wantTokens = new Set(tokens(args.entity_name));
      const gotTokens = tokens(args.candidate_title);
      if (wantTokens.size > 0) {
        let hits = 0;
        for (const t of gotTokens) if (wantTokens.has(t)) hits += 1;
        const ratio = hits / wantTokens.size;
        if (ratio >= 0.5) score += 15;
      }
    }
  }

  if (args.candidate_published_date) {
    const ts = Date.parse(args.candidate_published_date);
    if (!Number.isNaN(ts)) {
      const ageMs = Date.now() - ts;
      const TWELVE_MO = 365 * 24 * 60 * 60 * 1000;
      if (ageMs >= 0 && ageMs <= TWELVE_MO) score += 10;
    }
  }

  // Ambiguity cap — if Tavily returned multiple results from the same domain,
  // we picked one but certainty is reduced. Hard ceiling at 60.
  if (args.siblings_from_same_domain >= 1) {
    score = Math.min(score, 60);
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Given Tavily's results list, pick the candidate (top result among
 * whitelist-matching ones) and the sibling count from the same domain.
 * Returns null if no result has a whitelist-matching hostname.
 */
export function pickCandidate(
  results: TavilyResult[],
  whitelist: RegExp,
): { chosen: TavilyResult; siblings_from_same_domain: number } | null {
  const matches: { result: TavilyResult; hostname: string }[] = [];
  for (const r of results) {
    try {
      const h = new URL(r.url).hostname;
      if (whitelist.test(h)) matches.push({ result: r, hostname: h });
    } catch {
      /* skip malformed */
    }
  }
  if (matches.length === 0) return null;

  // Top-rated (by Tavily's own score) wins; if Tavily returns no score,
  // first match wins.
  matches.sort((a, b) => (b.result.score ?? 0) - (a.result.score ?? 0));
  const chosen = matches[0];

  let siblings = 0;
  for (const m of matches.slice(1)) {
    if (m.hostname === chosen.hostname) siblings += 1;
  }
  return { chosen: chosen.result, siblings_from_same_domain: siblings };
}
