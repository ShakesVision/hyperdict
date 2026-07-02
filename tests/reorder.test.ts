/**
 * Tests for dictionary reordering (drives tab order). No network.
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect } from 'vitest';
import { HyperDict } from '../src/core/engine';

function names(e: HyperDict): string[] {
  return e.listDictionaries().map((d) => d.name);
}

describe('reorderDictionaries', () => {
  it('reorders to the given order and preserves origins', () => {
    const e = new HyperDict();
    e.registerDictionary({ name: 'A', path: '/a/' });
    e.registerDictionary({ name: 'B', path: '/b/' }, 'custom');
    e.registerDictionary({ name: 'C', path: '/c/' });
    expect(names(e)).toEqual(['A', 'B', 'C']);

    e.reorderDictionaries(['C', 'A', 'B']);
    expect(names(e)).toEqual(['C', 'A', 'B']);
    expect(e.listDictionaries().find((d) => d.name === 'B')?.origin).toBe('custom');
  });

  it('appends names omitted from the order at the end', () => {
    const e = new HyperDict();
    ['A', 'B', 'C'].forEach((n) => e.registerDictionary({ name: n, path: `/${n}/` }));
    e.reorderDictionaries(['B']); // only B specified
    expect(names(e)).toEqual(['B', 'A', 'C']);
  });

  it('ignores unknown names', () => {
    const e = new HyperDict();
    e.registerDictionary({ name: 'A', path: '/a/' });
    e.reorderDictionaries(['ghost', 'A']);
    expect(names(e)).toEqual(['A']);
  });
});
