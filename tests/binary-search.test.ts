/**
 * Binary Search Tests
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShaekeebBinarySearch } from '../src/algorithms/binary-search';
import { ShaekeebTypedIndexBuilder } from '../src/index/typed-index';

describe('ShaekeebBinarySearch', () => {
  let search: ShaekeebBinarySearch;

  beforeEach(() => {
    // Build test index
    const builder = new ShaekeebTypedIndexBuilder();

    const testWords = [
      'apple',
      'banana',
      'cherry',
      'date',
      'elderberry',
      'fig',
      'grape',
      'honeydew',
    ];

    testWords.forEach((word, i) => {
      builder.addEntry(word, i * 1000, 100 + i * 10);
    });

    const index = builder.build();
    search = new ShaekeebBinarySearch(index);
  });

  it('should find exact word match', () => {
    const result = search.findWord('banana');
    expect(result).toBe(1);
  });

  it('should return -1 for non-existent word', () => {
    const result = search.findWord('lemon');
    expect(result).toBe(-1);
  });

  it('should find first word', () => {
    const result = search.findWord('apple');
    expect(result).toBe(0);
  });

  it('should find last word', () => {
    const result = search.findWord('honeydew');
    expect(result).toBe(7);
  });

  it('should handle case-sensitive search', () => {
    const result = search.findWord('Apple');
    expect(result).toBe(-1);
  });

  it('should find words with prefix', () => {
    const results = search.findPrefix('b');
    expect(results.length).toBe(1);
    expect(results[0]).toBe(1); // banana
  });

  it('should find multiple words with prefix', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    const words = ['cat', 'car', 'card', 'care', 'dog'];

    words.forEach((word, i) => {
      builder.addEntry(word, i * 1000, 100);
    });

    const index = builder.build();
    const searcher = new ShaekeebBinarySearch(index);

    const results = searcher.findPrefix('ca');
    expect(results.length).toBe(4); // cat, car, card, care
  });

  it('should get word string at index', () => {
    const word = search.getWord(2); // cherry
    expect(word).toBe('cherry');
  });

  it('should handle UTF-8 words (Urdu)', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    // Note: Binary search requires sorted words
    const words = ['کتاب', 'لکھنا', 'پڑھنا', 'سمجھنا'].sort();

    words.forEach((word, i) => {
      builder.addEntry(word, i * 1000, 100);
    });

    const index = builder.build();
    const searcher = new ShaekeebBinarySearch(index);

    // Find the index of the word we're searching for
    const wordIndex = words.indexOf('کتاب');
    const result = searcher.findWord('کتاب');
    expect(result).toBe(wordIndex);
  });

  it('should handle Arabic words', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    const words = ['علم', 'عمل', 'عالم'];

    words.forEach((word, i) => {
      builder.addEntry(word, i * 1000, 100);
    });

    const index = builder.build();
    const searcher = new ShaekeebBinarySearch(index);

    const result = searcher.findWord('عمل');
    expect(result).toBe(1);
  });
});
