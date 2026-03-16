/**
 * Range Fetch - HTTP range requests for efficient block loading
 * Authored by Shakeeb Ahmad
 *
 * Fetches only required bytes from .dict.dz using HTTP Range header
 * Supports both full file fetches and partial range requests
 */

export class ShaekeebRangeFetcher {
  private url: string;
  private cache: Map<number, Uint8Array> = new Map(); // Simple in-memory cache

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Fetch byte range from URL
   * Uses HTTP Range header for efficient partial downloads
   */
  public async fetchRange(start: number, end: number): Promise<Uint8Array> {
    const cacheKey = (start << 32) | end; // Simple cache key

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    try {
      const response = await fetch(this.url, {
        headers: {
          Range: `bytes=${start}-${end - 1}`, // end is exclusive, Range is inclusive
        },
      });

      if (!response.ok && response.status !== 206) {
        // 206 is Partial Content
        throw new Error(`Failed to fetch range: ${response.status} ${response.statusText}`);
      }

      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);

      // Cache the result
      this.cache.set(cacheKey, data);

      return data;
    } catch (error) {
      throw new Error(`Range fetch failed for ${this.url} (${start}-${end}): ${String(error)}`);
    }
  }

  /**
   * Fetch entire file
   */
  public async fetchFull(): Promise<Uint8Array> {
    const response = await fetch(this.url);

    if (!response.ok) {
      throw new Error(`Failed to fetch ${this.url}: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Get file size using HEAD request
   */
  public async getFileSize(): Promise<number> {
    const response = await fetch(this.url, { method: 'HEAD' });

    if (!response.ok) {
      throw new Error(`Failed to get file size: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    if (!contentLength) {
      throw new Error('Content-Length header not available');
    }

    return parseInt(contentLength, 10);
  }

  /**
   * Check if server supports range requests
   */
  public async supportsRange(): Promise<boolean> {
    const response = await fetch(this.url, { method: 'HEAD' });
    const acceptRanges = response.headers.get('accept-ranges');
    return acceptRanges !== 'none';
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    size: number;
    itemCount: number;
    memoryUsage: number;
  } {
    let memoryUsage = 0;

    for (const data of this.cache.values()) {
      memoryUsage += data.byteLength;
    }

    return {
      size: this.cache.size,
      itemCount: this.cache.size,
      memoryUsage,
    };
  }
}
