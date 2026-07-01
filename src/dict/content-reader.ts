/**
 * ContentReader - reads a definition's raw bytes by (offset, length)
 * Authored by Shakeeb Ahmad
 *
 * StarDict definitions are located by an uncompressed byte offset + length taken
 * from the .idx. Two implementations satisfy this contract:
 *   - ShaekeebBlockReader — for dictzip (.dict.dz) content (fetch chunk + inflate)
 *   - PlainDictReader      — for an UNCOMPRESSED .dict file (just read the range)
 *
 * A plain .dict stores the exact same bytes a .dict.dz decompresses to, so the
 * .idx offsets are identical; the only difference is that no inflation is needed.
 */

import type { ByteSource } from '../io/byte-source';

export interface ContentReader {
  readBytes(offset: number, length: number): Promise<Uint8Array>;
}

/** Reads definition bytes straight from an uncompressed .dict via a ByteSource. */
export class PlainDictReader implements ContentReader {
  constructor(private readonly source: ByteSource) {}

  public async readBytes(offset: number, length: number): Promise<Uint8Array> {
    if (length <= 0) {
      return new Uint8Array(0);
    }
    return this.source.read(offset, offset + length);
  }
}
