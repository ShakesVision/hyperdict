/**
 * DictZip Header Parser - Parse gzip header + the dictzip "RA" extra field
 * Authored by Shakeeb Ahmad
 *
 * A .dict.dz file is a standard gzip stream (RFC 1952) whose payload is split
 * into fixed-size UNCOMPRESSED chunks. Each chunk is an independent raw-DEFLATE
 * stream, which is what makes random access possible: to read uncompressed byte
 * O you only need to fetch + inflate the single chunk that contains it.
 *
 * The chunk table lives in the gzip "extra" field as the "RA" (Random Access)
 * subfield. Its layout (all multi-byte values LITTLE-ENDIAN):
 *
 *   SI1   = 'R' (0x52)
 *   SI2   = 'A' (0x41)
 *   LEN   = u16   length of the subfield data that follows (= 6 + 2*CHCNT)
 *   VER   = u16   version (= 1)
 *   CHLEN = u16   uncompressed bytes per chunk      (e.g. 58315)
 *   CHCNT = u16   number of chunks
 *   CHUNKS[CHCNT] = u16 each, the COMPRESSED length of each chunk
 *
 * The compressed data for chunk i begins at `dataStart + Σ CHUNKS[0..i-1]`,
 * where `dataStart` is the offset immediately after the entire gzip header
 * (extra field + optional FNAME + optional FCOMMENT + optional FHCRC).
 *
 * NOTE: the previous implementation read these fields as big-endian and treated
 * the table as absolute 4-byte offsets, which is incorrect for every dictzip
 * file. That bug made all definition reads fetch the wrong bytes.
 */

import type { DictZipHeader } from '../core/types';

// gzip FLG bits (RFC 1952 §2.3.1)
const FHCRC = 0x02;
const FEXTRA = 0x04;
const FNAME = 0x08;
const FCOMMENT = 0x10;

export class ShaekeebDictZipHeaderParser {
  /**
   * Parse a dictzip header from the leading bytes of a .dict.dz file.
   *
   * The supplied buffer must contain the FULL gzip header (base header + extra
   * field + any FNAME/FCOMMENT). The engine fetches enough bytes up front; if
   * the buffer is too short to hold the whole RA table this throws so the caller
   * can refetch a larger range.
   */
  public parseHeader(buffer: ArrayBuffer | Uint8Array): DictZipHeader {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = bytes.byteLength;

    if (len < 12) {
      throw new Error('DictZip header too short');
    }

    // --- gzip base header (10 bytes) ---
    if (view.getUint8(0) !== 0x1f || view.getUint8(1) !== 0x8b) {
      throw new Error('Not a valid gzip file (bad magic)');
    }
    if (view.getUint8(2) !== 8) {
      throw new Error('Unsupported gzip compression method (expected deflate)');
    }
    const flags = view.getUint8(3);
    // bytes 4-7 mtime, 8 XFL, 9 OS — skipped.

    if ((flags & FEXTRA) === 0) {
      throw new Error('Not a dictzip file: gzip FEXTRA flag is not set');
    }

    let offset = 10;

    // --- extra field ---
    const xlen = view.getUint16(offset, true);
    offset += 2;
    const extraStart = offset;
    const extraEnd = offset + xlen;
    if (extraEnd > len) {
      throw new Error(
        `DictZip header truncated: need ${extraEnd} bytes for extra field, have ${len}`
      );
    }

    const ra = this.parseRaSubfield(view, extraStart, extraEnd);
    if (!ra) {
      throw new Error('RA (Random Access) subfield not found in gzip extra field');
    }

    // --- compute where the compressed data actually begins ---
    // After the extra field come optional FNAME / FCOMMENT (null-terminated)
    // and optional FHCRC (2 bytes), THEN the deflate data.
    let dataStart = extraEnd;
    if (flags & FNAME) {
      dataStart = this.skipNullTerminated(view, dataStart, len);
    }
    if (flags & FCOMMENT) {
      dataStart = this.skipNullTerminated(view, dataStart, len);
    }
    if (flags & FHCRC) {
      dataStart += 2;
    }

    // --- prefix-sum the per-chunk compressed lengths into absolute offsets ---
    const cumOffsets = new Uint32Array(ra.chunkCount);
    let running = dataStart;
    for (let i = 0; i < ra.chunkCount; i++) {
      cumOffsets[i] = running;
      running += ra.chunkCompLengths[i];
    }

    return {
      chunkLength: ra.chunkLength,
      chunkCount: ra.chunkCount,
      chunkCompLengths: ra.chunkCompLengths,
      cumOffsets,
      dataStart,
    };
  }

  /**
   * Scan the gzip extra field for the 'RA' subfield and decode its chunk table.
   * Returns null if no RA subfield is present.
   */
  private parseRaSubfield(
    view: DataView,
    start: number,
    end: number
  ): { chunkLength: number; chunkCount: number; chunkCompLengths: Uint32Array } | null {
    let offset = start;

    // Each subfield: SI1, SI2, LEN(u16 LE), then LEN bytes of data.
    while (offset + 4 <= end) {
      const si1 = view.getUint8(offset);
      const si2 = view.getUint8(offset + 1);
      const subLen = view.getUint16(offset + 2, true);
      const dataOff = offset + 4;

      if (si1 === 0x52 /* 'R' */ && si2 === 0x41 /* 'A' */) {
        if (dataOff + 6 > end) {
          throw new Error('Truncated RA subfield header');
        }
        const version = view.getUint16(dataOff, true);
        if (version !== 1) {
          // Be lenient: warn but keep parsing — the layout has been stable.
          console.warn(`[dictzip] Unexpected RA version ${version} (expected 1)`);
        }
        const chunkLength = view.getUint16(dataOff + 2, true);
        const chunkCount = view.getUint16(dataOff + 4, true);

        const tableStart = dataOff + 6;
        const tableEnd = tableStart + chunkCount * 2;
        if (tableEnd > end) {
          throw new Error(
            `DictZip RA chunk table truncated: need ${tableEnd} bytes, extra field ends at ${end}`
          );
        }
        if (chunkLength === 0 || chunkCount === 0) {
          throw new Error('DictZip RA subfield reports zero chunks');
        }

        const chunkCompLengths = new Uint32Array(chunkCount);
        for (let i = 0; i < chunkCount; i++) {
          chunkCompLengths[i] = view.getUint16(tableStart + i * 2, true);
        }

        return { chunkLength, chunkCount, chunkCompLengths };
      }

      // Not RA — skip this subfield and continue.
      offset = dataOff + subLen;
    }

    return null;
  }

  /** Advance past a null-terminated string; returns the offset just after the NUL. */
  private skipNullTerminated(view: DataView, offset: number, end: number): number {
    while (offset < end && view.getUint8(offset) !== 0) {
      offset++;
    }
    if (offset >= end) {
      throw new Error('DictZip header truncated while skipping a null-terminated field');
    }
    return offset + 1; // skip the NUL itself
  }

  /**
   * Map an UNCOMPRESSED byte offset to the chunk index that contains it.
   */
  public chunkForOffset(header: DictZipHeader, uncompressedOffset: number): number {
    if (uncompressedOffset < 0) {
      return -1;
    }
    const idx = Math.floor(uncompressedOffset / header.chunkLength);
    return idx < header.chunkCount ? idx : -1;
  }

  /**
   * Compressed byte range [start, end) to fetch for a given chunk index.
   */
  public compressedRangeForChunk(
    header: DictZipHeader,
    chunkIndex: number
  ): { start: number; end: number } | null {
    if (chunkIndex < 0 || chunkIndex >= header.chunkCount) {
      return null;
    }
    const start = header.cumOffsets[chunkIndex];
    return { start, end: start + header.chunkCompLengths[chunkIndex] };
  }
}
