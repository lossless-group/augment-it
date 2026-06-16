<script lang="ts">
  // Reusable list-of-links sub-dimension. Used for personal_links,
  // personal_corpus, org_links, org_corpus. Each row is just a URL
  // input — kind auto-infers from the URL pattern and shows as a
  // small read-only badge. Enter commits the row.

  import type { Link, LinkKind } from '../lib/types';

  let {
    label,
    links = $bindable<Link[]>([]),
    onAppend,
  }: {
    label: string;
    links: Link[];
    onAppend: (link: Link) => Promise<void>;
  } = $props();

  let saved = $state<boolean[]>([]);

  function inferKind(url: string): LinkKind {
    let path = '';
    let host = '';
    try {
      const u = new URL(url);
      path = u.pathname.toLowerCase();
      host = u.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      return 'other';
    }
    if (host === 'linkedin.com' && /^\/in\/[^/]+/.test(path))      return 'linkedin_profile';
    if (host === 'linkedin.com' && /^\/company\/[^/]+/.test(path)) return 'linkedin_company';
    if (host === 'x.com' || host === 'twitter.com')                return 'x_profile';
    if (host === 'github.com' && /^\/[^/]+\/?$/.test(path))        return 'github_profile';
    if (/\.substack\.com$/.test(host) || host === 'substack.com')  return 'substack';
    if (host === 'threads.net')                                    return 'threads_profile';
    if (host === 'bsky.app')                                       return 'bluesky_profile';
    if (host === 'mastodon.social' || /mastodon/.test(host))       return 'mastodon_profile';
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'vimeo.com') return 'video';
    if (host === 'podcasts.apple.com' || /spotify\.com\/episode/.test(host + path)) return 'podcast';
    if (/(^|\/)team(\/|$)|\/staff\/|\/our[-_]team\//.test(path))         return 'team_page';
    if (/\/author\/|\/contributors?\/|\/people\//.test(path))            return 'author_bio';
    if (/press[-_]?release|\/press\/|\/news[-_]?releases?\//.test(path)) return 'press_release';
    if (/\/publications?\/|\/reports?\/|\/research\//.test(path))        return 'publication';
    if (/\/podcasts?\/|\/episodes?\//.test(path))                        return 'podcast';
    if (/\/events?\/|\/conference|\/keynote/.test(path))                 return 'speaking_event';
    if (/\/interviews?\/|\/q[-_]?and[-_]?a\//.test(path))                return 'interview';
    if (/\/news\/|\/feature\//.test(path))                               return 'news_feature';
    if (/\/careers?\/|\/jobs?\//.test(path))                             return 'careers';
    if (/\/about\/?$|\/who[-_]we[-_]are\//.test(path))                   return 'about';
    if (/\/blog\/|\/posts?\/|\/articles?\//.test(path))                  return 'blog_post';
    if (path === '/' || path === '')                                     return 'website';
    return 'other';
  }

  function add() { links = [...links, { url: '', kind: 'other' }]; saved = [...saved, false]; }
  function remove(i: number) {
    links = links.filter((_, idx) => idx !== i);
    saved = saved.filter((_, idx) => idx !== i);
  }
  function onInput(i: number) {
    saved[i] = false;
    if (links[i].url) links[i].kind = inferKind(links[i].url);
  }
  async function commit(i: number) {
    if (!links[i].url.trim()) return;
    await onAppend(links[i]);
    saved[i] = true;
    setTimeout(() => { saved[i] = false; }, 1200);
  }
  function onKey(i: number, e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(i); }
  }
</script>

<section class="pd-section">
  <h3 class="pd-title">{label}</h3>
  {#if links.length > 0}
    <div class="pd-stack">
      {#each links as _link, i (i)}
        <div class="pd-link-row">
          <input
            type="url"
            class:pd-flash={saved[i]}
            bind:value={links[i].url}
            oninput={() => onInput(i)}
            onkeydown={(e) => onKey(i, e)}
            placeholder="paste any URL — Enter to save"
          />
          {#if links[i].url && links[i].kind !== 'other'}
            <span class="pd-link-kind">{links[i].kind}</span>
          {/if}
          {#if saved[i]}<span class="pd-saved">✓</span>{/if}
          <button type="button" class="pd-icon-btn" onclick={() => remove(i)} title="Remove">×</button>
        </div>
      {/each}
    </div>
  {/if}
  <button type="button" class="pd-ghost-btn" onclick={add}>+ add link</button>
</section>
