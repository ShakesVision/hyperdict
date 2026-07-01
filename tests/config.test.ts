/**
 * Tests for config resolution + export (no network).
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect } from 'vitest';
import { resolveFiles } from '../src/dict/dictionary';
import { HyperDict } from '../src/core/engine';

describe('resolveFiles', () => {
  it('builds URLs from path + name', () => {
    const files = resolveFiles({ name: 'MyDict', path: 'https://cdn/x/' });
    expect(files.ifo).toBe('https://cdn/x/MyDict.ifo');
    expect(files.idx).toBe('https://cdn/x/MyDict.idx');
    expect(files.dict).toBe('https://cdn/x/MyDict.dict.dz');
  });

  it('honors basename and a missing trailing slash', () => {
    const files = resolveFiles({ name: 'D', path: 'https://cdn/x', basename: 'real' });
    expect(files.idx).toBe('https://cdn/x/real.idx');
  });

  it('prefers explicit files', () => {
    const files = resolveFiles({
      name: 'D',
      files: { ifo: 'a.ifo', idx: 'a.idx', dict: 'a.dict.dz' },
    });
    expect(files.dict).toBe('a.dict.dz');
    expect(files.syn).toBeUndefined();
  });

  it('throws when neither files nor path is given', () => {
    expect(() => resolveFiles({ name: 'D' })).toThrow();
  });
});

describe('HyperDict config export', () => {
  it('round-trips registered configs', () => {
    const engine = new HyperDict();
    engine.registerDictionary({ name: 'A', path: '/a/', label: 'Alpha', dir: 'rtl' });
    engine.registerDictionary({ name: 'B', files: { ifo: 'b.ifo', idx: 'b.idx', dict: 'b.dict.dz' } });
    const exported = engine.exportConfig();
    expect(exported.map((c) => c.name)).toEqual(['A', 'B']);
    expect(exported[0].label).toBe('Alpha');
    expect(exported[1].files?.idx).toBe('b.idx');
  });
});
