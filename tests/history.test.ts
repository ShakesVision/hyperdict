/**
 * Tests for the recent-search history store (in-memory path).
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect } from 'vitest';
import { SearchHistory } from '../src/ui/history';

describe('SearchHistory', () => {
  it('keeps most-recent-first and de-duplicates', () => {
    const h = new SearchHistory({ storageKey: null });
    h.add('a');
    h.add('b');
    h.add('a'); // moves 'a' back to front
    expect(h.list()).toEqual(['a', 'b']);
  });

  it('enforces the cap', () => {
    const h = new SearchHistory({ limit: 3, storageKey: null });
    ['a', 'b', 'c', 'd'].forEach((w) => h.add(w));
    expect(h.list()).toEqual(['d', 'c', 'b']);
  });

  it('ignores blank input and clears', () => {
    const h = new SearchHistory({ storageKey: null });
    h.add('  ');
    h.add('word');
    expect(h.list()).toEqual(['word']);
    h.clear();
    expect(h.list()).toEqual([]);
  });
});
