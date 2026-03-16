/**
 * Prefix Index Tests
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShaekeebPrefixIndex } from '../src/algorithms/prefix-index';
import { ShaekeebTypedIndexBuilder } from '../src/index/typed-index';

describe('ShaekeebPrefixIndex', () => {
  let prefixIndex: ShaekeebPrefixIndex;

  beforeEach(() => {
    const builder = new ShaekeebTypedIndexBuilder();

    const testWords = [
      'apple',
      'apricot',
      'banana',
      'blueberry',
      'cherry',
      'date',
      'elderberry',
      'fig',
    ];

    testWords.forEach((word, i) => {
      builder.addEntry(word, i * 1000, 100 + i * 10);
    });

    const index = builder.build();
    prefixIndex = new ShaekeebPrefixIndex(index);
  });

  it('should create prefix index', () => {
    expect(prefixIndex).toBeDefined();
  });

  it('should get search range for word starting with "a"', () => {
    const range = prefixIndex.getSearchRange('apple');
    expect(range).not.toBeNull();
    if (range) {
      expect(range.start).toBeLessThanOrEqual(range.end);
      expect(range.start).toBeLessThanOrEqual(1); // apple and apricot
    }
  });

  it('should get search range for word starting with "b"', () => {
    const range = prefixIndex.getSearchRange('banana');
    expect(range).not.toBeNull();
    if (range) {
      expect(range.start).toBeLessThanOrEqual(range.end);
    }
  });

  it('should get search range for word starting with "c"', () => {
    const range = prefixIndex.getSearchRange('cherry');
    expect(range).not.toBeNull();
    if (range) {
      expect(range.start).toBeLessThanOrEqual(range.end);
    }
  });

  it('should handle rare prefixes', () => {
    const range = prefixIndex.getSearchRange('fig');
    expect(range).not.toBeNull();
  });

  it('should return null for non-existent prefix', () => {
    const range = prefixIndex.getSearchRange('zebra');
    expect(range).toBeNull();
  });

  it('should report memory usage', () => {
    const memory = prefixIndex.getMemoryUsage();
    expect(memory).toBeGreaterThanOrEqual(0);
    // Should be much less than raw word storage
    expect(memory).toBeLessThan(200 * 1024); // < 200KB target
  });

  it('should report statistics', () => {
    const stats = prefixIndex.getStats();

    expect(stats).toHaveProperty('totalPrefixes');
    expect(stats).toHaveProperty('totalWords');
    expect(stats).toHaveProperty('averageWordsPerPrefix');
    expect(stats).toHaveProperty('memoryUsage');

    expect(stats.totalWords).toBe(8);
    expect(stats.totalPrefixes).toBeGreaterThan(0);
  });

  it('should handle UTF-8 prefixes (Urdu)', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    const words = ['کتاب', 'کام', 'لکھنا', 'لمحہ'];

    words.forEach((word, i) => {
      builder.addEntry(word, i * 1000, 100);
    });

    const index = builder.build();
    const index2 = new ShaekeebPrefixIndex(index);

    const range1 = index2.getSearchRange('کتاب');
    const range2 = index2.getSearchRange('لکھنا');

    expect(range1).not.toBeNull();
    expect(range2).not.toBeNull();
  });

  it('should handle Arabic characters', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    const words = ['علم', 'عمل', 'عالم', 'فن'];

    words.forEach((word, i) => {
      builder.addEntry(word, i * 1000, 100);
    });

    const index = builder.build();
    const index3 = new ShaekeebPrefixIndex(index);

    const range = index3.getSearchRange('علم');
    expect(range).not.toBeNull();
  });

  it('should optimize search scope', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    const words = [];

    // Generate 1000 words for comprehensive test
    for (let i = 0; i < 100; i++) {
      words.push(`apple${i}`);
    }
    for (let i = 0; i < 100; i++) {
      words.push(`banana${i}`);
    }
    for (let i = 0; i < 100; i++) {
      words.push(`cherry${i}`);
    }
    // ... more prefixes

    words.forEach((word, i) => {
      builder.addEntry(word, i * 1000, 100);
    });

    const index = builder.build();
    const index4 = new ShaekeebPrefixIndex(index);

    // Search range for "apple" should be much smaller than full index
    const range = index4.getSearchRange('apple');
    if (range) {
      const searchSize = range.end - range.start + 1;
      expect(searchSize).toBeLessThan(words.length); // Optimized
      expect(searchSize).toBeGreaterThanOrEqual(100); // At least ~100 words
    }
  });
});
