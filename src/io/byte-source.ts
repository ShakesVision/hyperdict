/**
 * ByteSource - a uniform "read this byte range" abstraction
 * Authored by Shakeeb Ahmad
 *
 * Definition content can come from two very different places:
 *   - a remote file read in slices over HTTP Range (the normal, low-memory path)
 *   - an in-memory buffer, e.g. a file extracted from a downloaded .zip archive
 *
 * Both the dictzip block reader and the plain-.dict reader work against this
 * interface, so the same decoding code serves HTTP and in-memory dictionaries.
 * `read(start, end)` uses an EXCLUSIVE end (like Array.slice).
 */

export interface ByteSource {
  read(start: number, end: number): Promise<Uint8Array>;
}

/** Reads ranges from a URL via HTTP Range requests. */
export class HttpByteSource implements ByteSource {
  constructor(private readonly url: string) {}

  public async read(start: number, end: number): Promise<Uint8Array> {
    if (end <= start) {
      return new Uint8Array(0);
    }
    const res = await fetch(this.url, { headers: { Range: `bytes=${start}-${end - 1}` } });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Range fetch failed (${res.status}) for ${this.url} [${start}-${end - 1}]`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}

/** Reads ranges from an in-memory buffer (zero-copy views). */
export class BufferByteSource implements ByteSource {
  constructor(private readonly bytes: Uint8Array) {}

  public async read(start: number, end: number): Promise<Uint8Array> {
    const s = Math.max(0, start);
    const e = Math.min(end, this.bytes.length);
    if (e <= s) {
      return new Uint8Array(0);
    }
    return this.bytes.subarray(s, e);
  }
}
