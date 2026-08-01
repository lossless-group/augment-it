// Group J — Alignment audit (pure core).
// Registry: context-v/specs/Corpora-Builder-Harmony-Test-Registry.md
//
// The standing invariant behind the 2026-07-30 by-hand check that caught
// humain-vc's missing corpora: per client, the canonical `domains` rows
// and the on-disk corpus folders must name the same corpora. Here we test
// the PURE diff (no cloud, no disk) with synthetic stores; the runnable
// scripts/audit-corpora-alignment.mjs feeds it the real read-only stores.

import { describe, expect, test } from 'vitest';
// @ts-expect-error — plain .mjs script lib, no type decls
import { diffCorpora, formatAlignmentReport } from '../../../scripts/lib/corpus-alignment.mjs';

const d = (client_slug: string, type: string, slug: string) => ({ client_slug, type, slug });

describe('Group J — corpora alignment audit', () => {
  test('identical DB and disk stores report aligned, per client', () => {
    const db = [d('humain-vc', 'thesis', 'consumer-immunology'), d('reach-edu', 'strategy', 'workforce-development')];
    const disk = [...db];
    const res = diffCorpora(db, disk);
    expect(res.aligned).toBe(true);
    expect(res.clients['humain-vc'].aligned).toBe(true);
    expect(res.clients['reach-edu'].aligned).toBe(true);
  });

  test('a domain in the DB but not on disk is flagged — the missing-corpus / lost-write case', () => {
    // humain-vc's exact symptom: the row exists, the folder never landed.
    const db = [d('humain-vc', 'thesis', 'consumer-immunology'), d('humain-vc', 'thesis', 'specialized-foundation-models')];
    const disk = [d('humain-vc', 'thesis', 'consumer-immunology')]; // sfm folder missing
    const res = diffCorpora(db, disk);
    expect(res.aligned).toBe(false);
    expect(res.clients['humain-vc'].onlyInDb).toEqual(['thesis:specialized-foundation-models']);
    expect(res.clients['humain-vc'].onlyOnDisk).toEqual([]);
  });

  test('a folder on disk with no DB row is flagged — the orphan-folder case', () => {
    const db = [d('reach-edu', 'strategy', 'workforce-development')];
    const disk = [d('reach-edu', 'strategy', 'workforce-development'), d('reach-edu', 'strategy', 'ghost-strategy')];
    const res = diffCorpora(db, disk);
    expect(res.aligned).toBe(false);
    expect(res.clients['reach-edu'].onlyOnDisk).toEqual(['strategy:ghost-strategy']);
    expect(res.clients['reach-edu'].onlyInDb).toEqual([]);
  });

  test('drift is scoped per client — one client’s drift never marks another', () => {
    const db = [d('humain-vc', 'thesis', 'a'), d('reach-edu', 'strategy', 'b')];
    const disk = [d('reach-edu', 'strategy', 'b')]; // only humain-vc drifts
    const res = diffCorpora(db, disk);
    expect(res.aligned).toBe(false);
    expect(res.clients['humain-vc'].aligned).toBe(false);
    expect(res.clients['reach-edu'].aligned).toBe(true);
  });

  test('the human report names the specific drift, flag-not-fix', () => {
    const res = diffCorpora([d('humain-vc', 'thesis', 'sfm')], []);
    const report = formatAlignmentReport(res);
    expect(report).toContain('DRIFT DETECTED');
    expect(report).toContain('in DB, missing on disk:  thesis:sfm');
  });
});
