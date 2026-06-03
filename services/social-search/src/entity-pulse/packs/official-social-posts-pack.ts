// official-social-posts-pack — Phase 1 of the Entity Pulse bundle.
//
// Spec: [[../../../../../context-v/specs/Entity-Pulse-Bundle]] §"Pass-1 pack
// details" → official-social-posts-pack.
//
// Walks `row.socials[]` (the entity's accepted social account URLs from a
// prior Profile Builder run) and surfaces the entity's OWN recent posts
// across those platforms. Distinct from socials-mentions-pack — which
// finds third-party mentions; this finds first-party posts.
//
// Mechanic (per spec): walk each social URL; fetch the page via Firecrawl;
// extract post-shaped outbound links (per-platform regex); emit one
// OfficialUpdateItem per post. Per-platform parsers stay simple in step 2;
// the gnarlier date + engagement extraction is a v2 concern.
//
// Step-2 scope:
//   - row.socials[] empty → graceful not_found with hint
//   - Each social URL scraped once (no per-post scrape — cost discipline);
//     date stays null when not surfaced in the parent page
//   - platforms_skipped[] in meta captures scrapers that 403/410/timeout

import {
  firecrawlScrape,
  type FirecrawlScrapeResult,
} from '../../connectors/firecrawl';
import {
  extractIsoFromJsonLd,
  extractIsoFromText,
  ageDaysFromIso,
} from '../../lib/helpers/iso-helper';
import type {
  EntityPulseListResponse,
  OfficialUpdateItem,
} from '../types';

export const OFFICIAL_SOCIAL_POSTS_PACK_ID = 'official-social-posts-pack';

export type SocialPlatform =
  | 'linkedin'
  | 'x'
  | 'youtube'
  | 'facebook'
  | 'instagram'
  | 'bluesky'
  | 'other';

export type OfficialSocialPostsPackInput = {
  pack_id?: string;
  row_id: string;
  // The entity's accepted social account URLs from Profile Builder. When
  // empty, the pack returns graceful not_found with hint.
  socials: string[];
  relevance_context?: string | null;
  max_posts_per_platform?: number;
  signal?: AbortSignal;
};

const DEFAULT_PER_PLATFORM = 10;

function platformOf(url: string): SocialPlatform {
  try {
    const host = new URL(url).host.toLowerCase().replace(/^www\./, '');
    if (host.endsWith('linkedin.com')) return 'linkedin';
    if (host === 'x.com' || host === 'twitter.com') return 'x';
    if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
    if (host.endsWith('facebook.com') || host === 'fb.com') return 'facebook';
    if (host.endsWith('instagram.com')) return 'instagram';
    if (host.endsWith('bsky.app')) return 'bluesky';
    return 'other';
  } catch {
    return 'other';
  }
}

// Per-platform post-URL recognizer. A link in the parent page's outbound
// links is "post-shaped" if it matches the platform's known post path.
// Loose on purpose — the curation layer is the gate; this is just the
// candidate filter.
function looksLikePost(platform: SocialPlatform, href: string): boolean {
  try {
    const u = new URL(href);
    const host = u.host.toLowerCase().replace(/^www\./, '');
    const path = u.pathname;
    switch (platform) {
      case 'linkedin':
        // /posts/<author>_<slug>, /feed/update/urn:li:activity:..., /pulse/...
        return host.endsWith('linkedin.com') && (
          path.startsWith('/posts/') ||
          path.startsWith('/feed/update/') ||
          path.startsWith('/pulse/')
        );
      case 'x':
        // /USER/status/ID
        return (host === 'x.com' || host === 'twitter.com') &&
          /\/[^/]+\/status\/\d+/.test(path);
      case 'youtube':
        // /watch?v=ID  OR  /shorts/ID
        return host.endsWith('youtube.com') && (
          path === '/watch' ||
          path.startsWith('/shorts/')
        ) || host === 'youtu.be';
      case 'facebook':
        // /USER/posts/ID, /story.php?story_fbid=, /reel/ID
        return (host.endsWith('facebook.com') || host === 'fb.com') && (
          /\/posts\//.test(path) ||
          /\/story\.php/.test(u.search) ||
          path.startsWith('/reel/')
        );
      case 'instagram':
        // /p/SHORTCODE, /reel/SHORTCODE
        return host.endsWith('instagram.com') && (
          path.startsWith('/p/') ||
          path.startsWith('/reel/')
        );
      case 'bluesky':
        // /profile/HANDLE/post/RKEY
        return host.endsWith('bsky.app') && /\/profile\/[^/]+\/post\//.test(path);
      default:
        return false;
    }
  } catch {
    return false;
  }
}

type PostLink = {
  url: string;
  platform: SocialPlatform;
  source_account_url: string;
};

function pickPostLinks(
  scrape: FirecrawlScrapeResult,
  accountUrl: string,
  platform: SocialPlatform,
  limit: number,
): PostLink[] {
  const seen = new Set<string>();
  const out: PostLink[] = [];
  for (const href of scrape.links ?? []) {
    if (!looksLikePost(platform, href)) continue;
    let absolute: string;
    try {
      absolute = new URL(href, accountUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    out.push({ url: absolute, platform, source_account_url: accountUrl });
    if (out.length >= limit) break;
  }
  return out;
}

// Best-effort date for a post link, using only data the parent-page scrape
// already gave us (no individual post fetch — cost discipline). Falls back
// to null when neither JSON-LD nor the markdown body has a recognizable
// date near the link.
function dateForPost(scrape: FirecrawlScrapeResult): string | null {
  return (
    extractIsoFromJsonLd(scrape.rawHtml ?? '') ??
    extractIsoFromText(scrape.markdown ?? '')
  );
}

export async function runOfficialSocialPostsPack(
  args: OfficialSocialPostsPackInput,
): Promise<EntityPulseListResponse<OfficialUpdateItem>> {
  const now = new Date();
  const packId = args.pack_id ?? OFFICIAL_SOCIAL_POSTS_PACK_ID;
  const perPlatform = args.max_posts_per_platform ?? DEFAULT_PER_PLATFORM;

  const byProvider: Record<string, number> = { firecrawl: 0 };
  const platformsSkipped: Array<{ platform: SocialPlatform; account_url: string; reason: string }> = [];
  const items: OfficialUpdateItem[] = [];

  if (args.socials.length === 0) {
    return {
      items: [],
      meta: {
        relevance_context: args.relevance_context ?? null,
        total_found: 0,
        dropped_low_confidence: 0,
        by_provider: byProvider,
        pack_id: packId,
        generated_at: now.toISOString(),
      },
    };
  }

  for (const accountUrl of args.socials) {
    const platform = platformOf(accountUrl);
    try {
      const scrape = await firecrawlScrape(accountUrl, {
        formats: ['markdown', 'links', 'rawHtml'],
        signal: args.signal,
      });
      byProvider.firecrawl += 1;

      const postLinks = pickPostLinks(scrape, accountUrl, platform, perPlatform);
      // Single date attempt per parent scrape — applied to every post we
      // found on that page. Cheap-and-coarse; v2 candidate is per-post fetch.
      const sharedDate = dateForPost(scrape);

      for (const link of postLinks) {
        items.push({
          url: link.url,
          title: scrape.metadata?.title ?? link.url,
          snippet: scrape.metadata?.description ?? '',
          published_date: sharedDate,
          age_days: ageDaysFromIso(sharedDate, now),
          confidence: null,
          relevance: null,
          content_type: 'official_social_post_item',
          platform,
        });
      }

      // If we got the page but found no post-shaped links, that's a "the
      // platform's scraping-resistant UI hid the posts" miss — record so
      // the human knows.
      if (postLinks.length === 0) {
        platformsSkipped.push({
          platform,
          account_url: accountUrl,
          reason: 'no post-shaped links found on account page',
        });
      }
    } catch (err) {
      platformsSkipped.push({
        platform,
        account_url: accountUrl,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    items,
    meta: {
      relevance_context: args.relevance_context ?? null,
      total_found: items.length,
      dropped_low_confidence: 0,
      by_provider: byProvider,
      pack_id: packId,
      generated_at: now.toISOString(),
      // platforms_skipped lives in source_indexes' slot for now; the spec's
      // PulseResponseMeta will grow a proper platforms_skipped field when the
      // rollup-agent lands and wants to render it. v1: stash here so the
      // information isn't lost.
      source_indexes: platformsSkipped.map(
        (p) => `[skipped] ${p.platform}: ${p.account_url} — ${p.reason}`,
      ),
    },
  };
}

// Re-export for the dispatcher (which needs to discover skipped platforms
// without rebuilding the structure).
export type { OfficialUpdateItem };
