// Per-specimen audit, measured from what actually painted.
//
// The rule this file inherits from apps/docs-portal/src/App.svelte: NEVER grade
// a token from its recorded value. Read `getComputedStyle` off the rendered
// element, so what is graded is what the browser did, not what the stylesheet
// claims. The same rule extends here to the contract checks — the F1a / F4 / F8
// findings come from the CSSOM rules that actually matched this specimen's
// elements, not from a source-file grep.
//
// That distinction is what makes the Audit tab different from `pnpm
// design:drift`. The script sweeps files and reports per MEMBER. This reports
// per COMPONENT, at the moment of render, in the mode you are looking at — so
// "which of my 40 rule-sets is the one with the hardcoded shadow" is a click
// rather than an investigation.

export type Finding = { label: string; detail: string };

export type ContrastFinding = { label: string; ratio: number; grade: 'pass' | 'large' | 'fail' };

export type AuditReport = {
  /** Text-on-background pairs measured off painted leaf elements. */
  contrast: ContrastFinding[];
  /** WCAG 2.2 2.5.8 — interactive targets under 24×24 CSS px. */
  targets: Finding[];
  /** Interactive elements with no accessible name at all. */
  names: Finding[];
  /** Interactive elements no matched rule styles on :focus-visible. */
  focus: Finding[];
  /** F2/F3 — classes inside the specimen that do not carry the member prefix. */
  leaks: Finding[];
  /** Tier-2/3 tokens this specimen's matched rules actually read. */
  tokens: string[];
  /** F1a — a member reading a Tier-1 name directly. */
  tier1: Finding[];
  /** F8 — colour literals in the matched rules. */
  literals: Finding[];
  /** F4 — a numeric z-index instead of a --z-* token. */
  zIndex: Finding[];
  /** Rules that matched, for the "how much CSS is this" count. */
  ruleCount: number;
};

const INTERACTIVE =
  'button, a[href], input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

/* ------------------------------------------------------------------ colour */

function luminance(rgb: number[]): number {
  const a = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/** Parse `rgb(r g b)` / `rgba(r,g,b,a)`. Returns [r,g,b,a]. */
function parseRgb(s: string): number[] | null {
  const m = s.match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  return [Number(m[0]), Number(m[1]), Number(m[2]), m.length > 3 ? Number(m[3]) : 1];
}

function ratio(fg: number[], bg: number[]): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
}

/**
 * The background a pixel of this element is actually drawn over.
 *
 * Every member in augment-it paints translucent tints (`color-mix(… ,
 * transparent)` is the house idiom for selection and confidence states), so the
 * element's own backgroundColor is routinely `rgba(…, 0)` or partially
 * transparent. Grading text against a transparent background reports a
 * contrast of 1 and is pure noise, which is exactly how a checker gets ignored.
 * Walk up to the first opaque ancestor and composite the translucent layers
 * back down onto it.
 */
function effectiveBackground(el: Element): number[] {
  const stack: number[][] = [];
  let node: Element | null = el;
  while (node) {
    const bg = parseRgb(getComputedStyle(node).backgroundColor);
    if (bg) {
      if (bg[3] >= 0.999) {
        // Opaque floor found — composite everything above it back down.
        let base = bg.slice(0, 3);
        for (let i = stack.length - 1; i >= 0; i--) {
          const layer = stack[i];
          const a = layer[3];
          base = [0, 1, 2].map((c) => layer[c] * a + base[c] * (1 - a));
        }
        return base;
      }
      if (bg[3] > 0) stack.push(bg);
    }
    node = node.parentElement;
  }
  // Nothing opaque all the way up — assume the document background.
  const doc = parseRgb(getComputedStyle(document.documentElement).backgroundColor);
  return doc ? doc.slice(0, 3) : [0, 0, 0];
}

function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean);
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32);
  return `${tag}${cls.length ? '.' + cls.join('.') : ''}${text ? ` — “${text}”` : ''}`;
}

function accessibleName(el: Element): string {
  return (
    el.getAttribute('aria-label') ??
    el.getAttribute('title') ??
    el.getAttribute('alt') ??
    el.getAttribute('placeholder') ??
    (el.textContent ?? '')
  )
    .trim();
}

/* -------------------------------------------------------------------- CSSOM */

/**
 * Every CSS rule in the document whose selector matches something inside this
 * specimen. Pseudo-classes and pseudo-elements are stripped before testing —
 * `.cc-app button:hover` cannot be `matches()`-ed at rest, but it is still one
 * of this component's rules and its declarations still count.
 *
 * Cross-origin stylesheets throw on `.cssRules`; skipped. In this stack that
 * costs nothing, because a member's CSS is injected by its own bundle as a
 * same-origin <style> element, federated or not.
 */
function matchedRules(root: HTMLElement): CSSStyleRule[] {
  const els: Element[] = [root, ...Array.from(root.querySelectorAll('*'))];
  const out: CSSStyleRule[] = [];

  const testable = (selector: string): string[] =>
    selector
      .split(',')
      .map((s) => s.replace(/::?[a-zA-Z-]+(\([^()]*\))?/g, '').trim())
      .filter(Boolean);

  const visit = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const parts = testable(rule.selectorText);
        const hit = parts.some((sel) =>
          els.some((el) => {
            try {
              return el.matches(sel);
            } catch {
              return false;
            }
          }),
        );
        if (hit) out.push(rule);
      } else if ('cssRules' in rule) {
        // @media / @supports / @layer — recurse, the rules inside still apply.
        try {
          visit((rule as CSSGroupingRule).cssRules);
        } catch {
          /* opaque grouping rule */
        }
      }
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      /* cross-origin — nothing readable, and nothing of ours lives there */
    }
  }
  return out;
}

/* ------------------------------------------------------------------- audit */

export type AuditOptions = {
  prefix: string;
  rootClass: string;
  exemptClasses?: readonly string[];
};

export function audit(root: HTMLElement, opts: AuditOptions): AuditReport {
  const report: AuditReport = {
    contrast: [],
    targets: [],
    names: [],
    focus: [],
    leaks: [],
    tokens: [],
    tier1: [],
    literals: [],
    zIndex: [],
    ruleCount: 0,
  };

  /* --- contrast, from painted leaves only ------------------------------- */
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    const ownText = Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
    );
    if (!ownText) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const fg = parseRgb(cs.color);
    if (!fg) continue;
    const r = ratio(fg.slice(0, 3), effectiveBackground(el));
    // Every type size in augment-it is under 18.66px (DESIGN.md typography
    // scale tops out at 18px), so there is no large-text allowance and 4.5 is
    // the bar for all of it. `large` is kept as a band so a near-miss reads
    // differently from a real failure.
    report.contrast.push({
      label: describe(el),
      ratio: r,
      grade: r >= 4.5 ? 'pass' : r >= 3 ? 'large' : 'fail',
    });
  }

  /* --- target size + accessible name ------------------------------------ */
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(INTERACTIVE))) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24)) {
      report.targets.push({
        label: describe(el),
        detail: `${Math.round(rect.width)}×${Math.round(rect.height)} — under the 24×24 floor`,
      });
    }
    if (!accessibleName(el)) {
      report.names.push({ label: describe(el), detail: 'no text, aria-label, title, alt or placeholder' });
    }
  }

  /* --- matched rules: containment + contract ---------------------------- */
  const rules = matchedRules(root);
  report.ruleCount = rules.length;

  const tokens = new Set<string>();
  const seenTier1 = new Set<string>();
  const seenLiteral = new Set<string>();

  for (const rule of rules) {
    const css = rule.cssText;

    for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) tokens.add(m[1]);

    // F1a — Tier-1 names use the double underscore (--color__graphite-900).
    for (const m of css.matchAll(/var\(\s*(--[a-z]+__[a-zA-Z0-9-]+)/g)) {
      if (seenTier1.has(m[1])) continue;
      seenTier1.add(m[1]);
      report.tier1.push({ label: m[1], detail: rule.selectorText });
    }

    // F8 — a literal colour anywhere in a member's own rule. Rules from
    // packages/theme legitimately carry literals; they are the source of them.
    // A theme rule reaches this loop only via `:root`-ish selectors, which the
    // specimen root (a div) does not match, so what lands here is the member's.
    for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g)) {
      const key = `${rule.selectorText}|${m[0]}`;
      if (seenLiteral.has(key)) continue;
      seenLiteral.add(key);
      report.literals.push({ label: m[0], detail: rule.selectorText });
    }

    // F4 — z-index must come from a --z-* token.
    const z = css.match(/z-index:\s*(-?\d+)/);
    if (z) report.zIndex.push({ label: `z-index: ${z[1]}`, detail: rule.selectorText });
  }

  report.tokens = [...tokens].sort();

  /* --- focus-visible coverage ------------------------------------------- */
  // Static-by-design: focusing every control to measure the ring would scroll
  // the page and fire the member's own focus handlers. Asking the CSSOM which
  // controls have a :focus-visible rule at all is the honest cheap check, and
  // it catches the failure that actually happens — a control nobody styled.
  const focusRules = rules.filter((r) => /:focus(-visible)?/.test(r.selectorText));
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(INTERACTIVE))) {
    const covered = focusRules.some((r) =>
      r.selectorText
        .split(',')
        .map((s) => s.replace(/::?[a-zA-Z-]+(\([^()]*\))?/g, '').trim())
        .filter(Boolean)
        .some((sel) => {
          try {
            return el.matches(sel);
          } catch {
            return false;
          }
        }),
    );
    if (!covered) report.focus.push({ label: describe(el), detail: 'no :focus-visible rule matches this control' });
  }

  /* --- F2/F3 containment ------------------------------------------------- */
  const exempt = new Set<string>([opts.rootClass, ...(opts.exemptClasses ?? [])]);
  const seenLeak = new Set<string>();
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[class]'))) {
    for (const cls of Array.from(el.classList)) {
      if (exempt.has(cls) || cls.startsWith(`${opts.prefix}-`)) continue;
      if (seenLeak.has(cls)) continue;
      seenLeak.add(cls);
      report.leaks.push({ label: `.${cls}`, detail: describe(el) });
    }
  }

  return report;
}

/**
 * Measure with the theme's colour transition suppressed.
 *
 * theme.css transitions background/color/border over 75ms on a mode swap.
 * Measuring inside that window reads colours mid-animation — the bug that
 * once reported a dark page background as light grey and failed every vibrant
 * foreground token. Suppress, force a synchronous style flush, measure, restore.
 */
export function auditSettled(root: HTMLElement, opts: AuditOptions): AuditReport {
  document.documentElement.classList.add('agx-measuring');
  void document.documentElement.offsetHeight;
  try {
    return audit(root, opts);
  } finally {
    document.documentElement.classList.remove('agx-measuring');
  }
}
