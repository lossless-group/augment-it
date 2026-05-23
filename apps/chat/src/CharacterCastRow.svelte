<script lang="ts">
  // CharacterCastRow — surfaces in-flight capability invocations as chips.
  //
  // Pattern 2 from [[Chat-As-Verb-Surface-Patterns]]: every capability
  // invocation emits a lifecycle event stream (started/progress/output/
  // done/error/quality_violation). The character cast is a fold over open
  // invocation_ids — when something starts, a chip appears; when it
  // completes, the chip fades out.
  //
  // For v0.0.1 the cast is generic: a single "Enrichment Agent" character
  // covers any prompt-runner-driven verb. Per-verb personification lands
  // in v0.0.2.

  import { workspace } from '@augment-it/workspace';

  // Subjects we care about — anything that hints at LLM/run/draft activity.
  const RUN_LIFECYCLE_SUBJECTS = [
    'prompt.run.progress',
    'prompt.run.completed',
    'prompt.apply.completed',
  ];

  // Derive open jobs from the event log. A job is "open" if we've seen a
  // progress event for its record_set_id but not yet a completed event.
  // This is a rough heuristic for v0.0.1 — v0.0.2 wires real lifecycle
  // events into the cast.
  const openJobs = $derived.by(() => {
    const open = new Map<string, { label: string; progress: number; total: number }>();
    for (const ev of workspace.events) {
      if (!RUN_LIFECYCLE_SUBJECTS.includes(ev.subject)) continue;
      const payload = ev.payload as {
        record_set_id?: string;
        prompt_id?: string;
        row_index?: number;
        row_count?: number;
      };
      const key = payload.record_set_id ?? payload.prompt_id ?? ev.subject;
      if (ev.subject === 'prompt.run.progress') {
        open.set(key, {
          label: 'Enrichment Agent',
          progress: payload.row_index ?? 0,
          total: payload.row_count ?? 0,
        });
      } else {
        open.delete(key);
      }
    }
    return [...open.values()];
  });
</script>

{#if openJobs.length > 0}
  <div class="cast-row">
    {#each openJobs as job, i (i)}
      <div class="chip">
        <span class="dot"></span>
        <span class="label">{job.label}</span>
        {#if job.total > 0}
          <span class="progress">{job.progress} / {job.total}</span>
        {/if}
      </div>
    {/each}
  </div>
{/if}
