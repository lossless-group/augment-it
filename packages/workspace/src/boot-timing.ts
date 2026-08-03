// boot-timing.ts — dead-simple boot-path instrumentation. No library.
//
// Step 0 of context-v/issues/Refactoring-for-API-Speed.md: the wall-clock the
// operator feels lives in the browser, and the shell wasn't timing itself.
// bootMark() stamps a milestone with performance.now() and logs elapsed ms, so
// "it's slow" becomes "workspace.activate took 58s and everything else 300ms".
//
// One timeline per page load (module singleton). Each federation container has
// its own copy — the shell's timeline is the boot the user waits on. On by
// default; silence with localStorage.setItem('augment_boot_timing','off').

type Mark = { name: string; at: number };

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

let t0: number | null = null;
let last = 0;
const marks: Mark[] = [];

function enabled(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem('augment_boot_timing') !== 'off';
  } catch {
    return true;
  }
}

/** Stamp a boot milestone. The first mark anchors T0 for the whole timeline. */
export function bootMark(name: string): void {
  if (!enabled()) return;
  const at = now();
  if (t0 === null) {
    t0 = at;
    last = at;
  }
  const sincePrev = at - last;
  const sinceStart = at - t0;
  last = at;
  marks.push({ name, at });
  console.info(
    `%c[boot]%c ${name.padEnd(26)} +${String(Math.round(sincePrev)).padStart(6)}ms   (T+${Math.round(sinceStart)}ms)`,
    'color:#8b5cf6;font-weight:bold',
    'color:inherit',
  );
}

/** Print the whole timeline as a table. Call at the final milestone. */
export function bootSummary(label = 'boot complete'): void {
  if (!enabled() || t0 === null) return;
  bootMark(label);
  const base = t0;
  const rows = marks.map((m, i) => ({
    milestone: m.name,
    'Δprev (ms)': i === 0 ? 0 : Math.round(m.at - marks[i - 1].at),
    'T+ (ms)': Math.round(m.at - base),
  }));
  console.table?.(rows);
}
