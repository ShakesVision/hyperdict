/**
 * Bloom Filter - Instant negative lookup
 * Authored by Shakeeb Ahmad
 *
 * Probabilistic data structure for instant negative lookups
 * False positive possible, but NO false negatives
 * If bloom filter says "not found", it's definitely not in the dictionary
 *
 * Target: 256KB memory, ~2^16 bits (65536 bits)
 */

export class ShaekeebBloomFilter {
  private bits: Uint8Array;
  private hashCount: number = 4; // Number of hash functions
  private bitSize: number;

  constructor(itemCount: number = 100000, falsePositiveRate: number = 0.01) {
    // Calculate optimal bit size using formula: m = -1 / ln(2)^2 * n * ln(p)
    this.bitSize = Math.ceil(
      ((-1 / Math.log(2) ** 2) * itemCount * Math.log(falsePositiveRate)) / 8
    );

    // Limit to 256KB
    if (this.bitSize > 256 * 1024) {
      this.bitSize = 256 * 1024;
    }

    // Minimum size
    if (this.bitSize < 1024) {
      this.bitSize = 1024;
    }

    this.bits = new Uint8Array(this.bitSize);
    this.hashCount = Math.ceil(((this.bitSize * 8) / itemCount) * Math.log(2));
  }

  /**
   * Add item to the bloom filter
   */
  public add(word: string): void {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(word);
    this.addBytes(bytes);
  }

  /**
   * Add raw bytes to bloom filter
   */
  public addBytes(bytes: Uint8Array): void {
    for (let i = 0; i < this.hashCount; i++) {
      const hash = this.hash(bytes, i);
      const byteIndex = Math.floor(hash / 8);
      const bitIndex = hash % 8;

      this.bits[byteIndex] |= 1 << bitIndex;
    }
  }

  /**
   * Check if item might be in the set
   * Returns false = definitely not in set
   * Returns true = might be in set
   */
  public mightContain(word: string): boolean {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(word);
    return this.mightContainBytes(bytes);
  }

  /**
   * Check raw bytes
   */
  public mightContainBytes(bytes: Uint8Array): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const hash = this.hash(bytes, i);
      const byteIndex = Math.floor(hash / 8);
      const bitIndex = hash % 8;

      if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false; // Definitely not in set
      }
    }

    return true; // Might be in set
  }

  /**
   * Hash function using multiple hashing strategies
   * Uses DJB2 combined with FNV-1a for distribution
   */
  private hash(bytes: Uint8Array, seed: number): number {
    let hash = 5381 + seed;

    for (let i = 0; i < bytes.length; i++) {
      hash = ((hash << 5) + hash) ^ bytes[i];
    }

    // Map to bit range
    const bitRange = this.bitSize * 8;
    return Math.abs(hash) % bitRange;
  }

  /**
   * Get memory usage
   */
  public getMemoryUsage(): number {
    return this.bits.byteLength;
  }

  /**
   * Get statistics
   */
  public getStats(): {
    bitSize: number;
    byteSize: number;
    hashCount: number;
    bitsSet: number;
    density: number;
  } {
    let bitsSet = 0;

    for (let i = 0; i < this.bits.length; i++) {
      const byte = this.bits[i];
      for (let j = 0; j < 8; j++) {
        if ((byte & (1 << j)) !== 0) {
          bitsSet++;
        }
      }
    }

    return {
      bitSize: this.bitSize * 8,
      byteSize: this.bitSize,
      hashCount: this.hashCount,
      bitsSet,
      density: bitsSet / (this.bitSize * 8),
    };
  }

  /**
   * Clear the filter
   */
  public clear(): void {
    this.bits.fill(0);
  }

  /**
   * Serialize to base64 for storage
   * Format: [hashCount:1byte][bits...]
   */
  public toBase64(): string {
    const header = new Uint8Array([this.hashCount]);
    const combined = new Uint8Array(1 + this.bits.length);
    combined.set(header);
    combined.set(this.bits, 1);

    const binary = String.fromCharCode(...Array.from(combined));
    return btoa(binary);
  }

  /**
   * Deserialize from base64
   */
  public static fromBase64(base64: string): ShaekeebBloomFilter {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // Extract header
    const hashCount = bytes[0];
    const bitArray = bytes.slice(1);

    const filter = new ShaekeebBloomFilter(0, 0.01);
    filter.bits = bitArray;
    filter.bitSize = bitArray.length;
    filter.hashCount = hashCount;

    return filter;
  }
}
