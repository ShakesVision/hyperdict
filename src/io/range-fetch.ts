/**
 * Range Fetch - HTTP range requests for efficient block loading
 * Authored by Shakeeb Ahmad
 *
 * Fetches only required bytes from .dict.dz using HTTP Range header
 * Supports both full file fetches and partial range requests
 */

export class ShakeebRangeFetcher {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Fetch a byte range via an HTTP Range request (end exclusive).
   *
   * No response caching here on purpose: decompressed dictzip chunks are cached
   * by the block reader (bounded LRU) and resolved definitions by the engine,
   * so caching raw ranges here too would just grow unbounded and double-store.
   */
  public async fetchRange(start: number, end: number): Promise<Uint8Array> {
    try {
      const response = await fetch(this.url, {
        headers: {
          Range: `bytes=${start}-${end - 1}`, // end is exclusive, Range is inclusive
        },
      });

      if (!response.ok && response.status !== 206) {
        throw new Error(`Failed to fetch range: ${response.status} ${response.statusText}`);
      }

      return new Uint8Array(await response.arrayBuffer());
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
}
