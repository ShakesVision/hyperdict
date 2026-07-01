/**
 * Live end-to-end integration test against a real StarDict dictionary.
 * Authored by Shakeeb Ahmad
 *
 * Skipped by default (it hits the network). Run with:
 *   HYPERDICT_LIVE=1 npx vitest run tests/integration.live.test.ts
 *
 * Proves the full pipeline: .ifo + .idx parse, bloom/prefix/binary lookup, and
 * dictzip random-access definition fetch + raw inflate returning real content.
 */

import { describe, it, expect } from 'vitest';
import { HyperDict } from '../src/core/engine';

const LIVE = process.env.HYPERDICT_LIVE === '1';
const BASE =
  'https://raw.githubusercontent.com/ShakesVision/urdu-archive/refs/heads/master/raw/DICTIONARIES/Urdu-Urdu/UrduLughatOffline/';

describe.skipIf(!LIVE)('HyperDict live (UrduLughat)', () => {
  it(
    'looks up an Urdu word and fetches its HTML definition',
    async () => {
      const engine = new HyperDict();
      engine.registerDictionary({ name: 'UrduLughat', path: BASE });
      await engine.init();

      const stats = engine.getStats();
      expect(stats.dictionaryCount).toBe(1);
      expect(stats.totalWords).toBeGreaterThan(1000);

      const result = engine.lookup('علم');
      const hit = result.dictionaries.find((d) => d.name === 'UrduLughat');
      expect(hit?.found).toBe(true);

      const def = await engine.getDefinition('UrduLughat', 'علم');
      expect(def).not.toBeNull();
      expect(def!.definition.length).toBeGreaterThan(0);
      expect(def!.type).toBe('h'); // UrduLughat declares sametypesequence=h
      // Sanity: the decoded text contains the headword.
      expect(def!.definition).toContain('علم');
    },
    30000
  );
});
