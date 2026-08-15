<script lang="ts">
  // The report for the specimen currently on screen, in the mode currently on
  // screen. Everything here was measured off the painted DOM by ./audit.ts —
  // see that file for why none of it is read from the manifest.

  import type { AuditReport } from './audit';

  let { report, tokens }: { report: AuditReport | null; tokens: string[] } = $props();

  const failing = $derived(report?.contrast.filter((c) => c.grade === 'fail') ?? []);
  const marginal = $derived(report?.contrast.filter((c) => c.grade === 'large') ?? []);
  const worst = $derived(
    report && report.contrast.length ? Math.min(...report.contrast.map((c) => c.ratio)) : null,
  );

  const contractCount = $derived(
    (report?.tier1.length ?? 0) + (report?.literals.length ?? 0) + (report?.zIndex.length ?? 0) + (report?.leaks.length ?? 0),
  );

  // Blocking vs advisory, counted separately and labelled as such. Rolling the
  // focus-rule warnings into one "accessibility" number made the summary read
  // `0 accessibility` above a list of two findings, which is the fastest way to
  // teach someone that the summary is not worth reading.
  const blocking = $derived(failing.length + (report?.targets.length ?? 0) + (report?.names.length ?? 0));
  const advisory = $derived(marginal.length + (report?.focus.length ?? 0));

  /** Tokens the catalog declared but the rendered specimen never read. */
  const undeclared = $derived(report ? report.tokens.filter((t) => !tokens.includes(t)) : []);
  const unused = $derived(report ? tokens.filter((t) => !report.tokens.includes(t)) : []);
</script>

{#if !report}
  <p class="agx-empty">Measuring…</p>
{:else}
  <div class="agx-audit-summary">
    <span class="agx-stat" data-tone={blocking ? 'bad' : 'good'}>
      <strong>{blocking}</strong> blocking a11y
    </span>
    <span class="agx-stat" data-tone={advisory ? 'warn' : 'good'}>
      <strong>{advisory}</strong> advisory a11y
    </span>
    <span class="agx-stat" data-tone={contractCount ? 'warn' : 'good'}>
      <strong>{contractCount}</strong> contract
    </span>
    <span class="agx-stat">
      <strong>{report.ruleCount}</strong> CSS rules matched
    </span>
    <span class="agx-stat">
      <strong>{report.tokens.length}</strong> tokens read
    </span>
    {#if worst !== null}
      <span class="agx-stat" data-tone={worst >= 4.5 ? 'good' : worst >= 3 ? 'warn' : 'bad'}>
        <strong>{worst}</strong> worst contrast
      </span>
    {/if}
  </div>

  <section class="agx-audit-block">
    <h4>Contrast — every text node, measured after paint</h4>
    {#if report.contrast.length === 0}
      <p class="agx-empty">No text in this specimen.</p>
    {:else}
      <ul class="agx-findings">
        {#each [...failing, ...marginal] as c}
          <li data-tone={c.grade === 'fail' ? 'bad' : 'warn'}>
            <span class="agx-ratio">{c.ratio}</span>
            <code>{c.label}</code>
            <span class="agx-note">
              {c.grade === 'fail' ? 'below 3:1 — fails at any size' : 'between 3 and 4.5 — fails AA at every size augment-it uses'}
            </span>
          </li>
        {/each}
        {#if failing.length + marginal.length === 0}
          <li data-tone="good">
            All {report.contrast.length} text nodes clear 4.5:1 against what they are actually painted over.
          </li>
        {/if}
      </ul>
    {/if}
  </section>

  <section class="agx-audit-block">
    <h4>Target size &amp; names — WCAG 2.5.8, 4.1.2</h4>
    <ul class="agx-findings">
      {#each report.targets as t}
        <li data-tone="bad"><code>{t.label}</code><span class="agx-note">{t.detail}</span></li>
      {/each}
      {#each report.names as n}
        <li data-tone="bad"><code>{n.label}</code><span class="agx-note">{n.detail}</span></li>
      {/each}
      {#each report.focus as f}
        <li data-tone="warn"><code>{f.label}</code><span class="agx-note">{f.detail}</span></li>
      {/each}
      {#if report.targets.length + report.names.length + report.focus.length === 0}
        <li data-tone="good">Every interactive element is at least 24×24, named, and has a focus rule.</li>
      {/if}
    </ul>
  </section>

  <section class="agx-audit-block">
    <h4>Federal contract — measured on this specimen's matched rules</h4>
    <ul class="agx-findings">
      {#each report.tier1 as v}
        <li data-tone="bad">
          <span class="agx-flag">F1a</span><code>{v.label}</code>
          <span class="agx-note">Tier-1 name read directly — in <code>{v.detail}</code></span>
        </li>
      {/each}
      {#each report.zIndex as v}
        <li data-tone="bad">
          <span class="agx-flag">F4</span><code>{v.label}</code>
          <span class="agx-note">not from a <code>--z-*</code> token — in <code>{v.detail}</code></span>
        </li>
      {/each}
      {#each report.literals as v}
        <li data-tone="warn">
          <span class="agx-flag">F8</span><code>{v.label}</code>
          <span class="agx-note">colour literal — in <code>{v.detail}</code></span>
        </li>
      {/each}
      {#each report.leaks as v}
        <li data-tone="warn">
          <span class="agx-flag">F2/F3</span><code>{v.label}</code>
          <span class="agx-note">unprefixed class — {v.detail}</span>
        </li>
      {/each}
      {#if contractCount === 0}
        <li data-tone="good">No Tier-1 reads, no colour literals, no bare z-index, no unprefixed classes.</li>
      {/if}
    </ul>
  </section>

  <section class="agx-audit-block">
    <h4>Token provenance</h4>
    <p class="agx-note agx-block-note">
      Every custom property named by a rule that matched this specimen. This is the component's real
      dependency on the federal layer — re-point one of these and this is what moves.
    </p>
    <div class="agx-tokenlist">
      {#each report.tokens as t (t)}
        <span class="agx-token" class:declared={tokens.includes(t)}>
          <span class="agx-token-chip" style:background={`var(${t})`}></span>{t}
        </span>
      {/each}
    </div>
    {#if tokens.length}
      {#if undeclared.length}
        <p class="agx-note">
          <strong>Read but not declared</strong> in the catalog entry: {undeclared.join(', ')}
        </p>
      {/if}
      {#if unused.length}
        <p class="agx-note"><strong>Declared but not read</strong>: {unused.join(', ')}</p>
      {/if}
    {/if}
  </section>
{/if}
