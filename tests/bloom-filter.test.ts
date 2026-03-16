/**
 * Bloom Filter Tests
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShaekeebBloomFilter } from '../src/algorithms/bloom-filter';

describe('ShaekeebBloomFilter', () => {
  let filter: ShaekeebBloomFilter;

  beforeEach(() => {
    filter = new ShaekeebBloomFilter(1000, 0.01);
  });

  it('should add and find items', () => {
    filter.add('hello');
    expect(filter.mightContain('hello')).toBe(true);
  });

  it('should definitely not contain non-added items', () => {
    filter.add('hello');
    // Note: bloom filter has false positives but no false negatives
    // So we can't test that it doesn't contain something
    // But with low false positive rate, most non-added items should return false
    expect(filter.mightContain('nonexistent')).toBe(false); // Likely false positive
  });

  it('should handle multiple additions', () => {
    const words = ['apple', 'banana', 'cherry', 'date'];

    words.forEach((word) => {
      filter.add(word);
    });

    words.forEach((word) => {
      expect(filter.mightContain(word)).toBe(true);
    });
  });

  it('should handle UTF-8 words', () => {
    const words = ['کتاب', 'لکھنا', 'پڑھنا'];

    words.forEach((word) => {
      filter.add(word);
    });

    words.forEach((word) => {
      expect(filter.mightContain(word)).toBe(true);
    });
  });

  it('should serialize and deserialize', () => {
    filter.add('hello');
    filter.add('world');

    const base64 = filter.toBase64();
    const restored = ShaekeebBloomFilter.fromBase64(base64);

    expect(restored.mightContain('hello')).toBe(true);
    expect(restored.mightContain('world')).toBe(true);
  });

  it('should report statistics', () => {
    filter.add('test1');
    filter.add('test2');

    const stats = filter.getStats();

    expect(stats).toHaveProperty('bitSize');
    expect(stats).toHaveProperty('byteSize');
    expect(stats).toHaveProperty('hashCount');
    expect(stats).toHaveProperty('bitsSet');
    expect(stats).toHaveProperty('density');
    expect(stats.density).toBeGreaterThan(0);
    expect(stats.bitsSet).toBeGreaterThan(0);
  });

  it('should track memory usage', () => {
    const memory = filter.getMemoryUsage();
    expect(memory).toBeGreaterThan(0);
    expect(memory).toBeLessThanOrEqual(256 * 1024); // Should be <= 256KB
  });

  it('should clear the filter', () => {
    filter.add('hello');
    filter.clear();

    // After clearing, the filter should have no bits set
    const stats = filter.getStats();
    expect(stats.bitsSet).toBe(0);
  });

  it('should handle raw bytes', () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('test');

    filter.addBytes(bytes);
    expect(filter.mightContainBytes(bytes)).toBe(true);
  });

  it('should have low false positive rate', () => {
    const itemCount = 1000;
    const filter100 = new ShaekeebBloomFilter(itemCount, 0.01);

    // Add many items
    for (let i = 0; i < itemCount; i++) {
      filter100.add(`item${i}`);
    }

    // Test false positive rate on non-existent items
    let falsePositives = 0;
    for (let i = itemCount; i < itemCount * 2; i++) {
      if (filter100.mightContain(`item${i}`)) {
        falsePositives++;
      }
    }

    const falsePositiveRate = falsePositives / itemCount;
    // Should be roughly around 1% with some tolerance for randomness
    expect(falsePositiveRate).toBeLessThan(0.05); // Allow up to 5%
  });
});
