/**
 * DictZip regression tests
 * Authored by Shakeeb Ahmad
 *
 * Guards the bug that made the original library unusable: the dictzip RA extra
 * field must be read as little-endian VER/CHLEN/CHCNT + a table of 2-byte
 * COMPRESSED chunk lengths, and definition reads must map an uncompressed offset
 * to the right chunk(s). We build a synthetic .dict.dz in-memory, parse it, and
 * read bytes back — including a read that straddles a chunk boundary.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { deflateSync } from 'fflate';
import { ShaekeebDictZipHeaderParser } from '../src/dictzip/header-parser';
import { ShaekeebBlockReader } from '../src/dictzip/block-reader';
import { rawInflate } from '../src/dictzip/inflate';

/** Build a minimal but valid dictzip (gzip + RA extra field) buffer. */
function buildDictzip(content: Uint8Array, chunkLength: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < content.length; i += chunkLength) {
    chunks.push(content.subarray(i, Math.min(i + chunkLength, content.length)));
  }
  const compressed = chunks.map((c) => deflateSync(c));
  const chcnt = compressed.length;

  const raDataLen = 6 + chcnt * 2; // VER + CHLEN + CHCNT + table
  const xlen = 4 + raDataLen; // SI1 SI2 LEN(2) + data
  const headerLen = 10 + 2 + xlen; // base header + XLEN + extra
  const totalComp = compressed.reduce((a, c) => a + c.length, 0);

  const buf = new Uint8Array(headerLen + totalComp);
  const dv = new DataView(buf.buffer);

  buf[0] = 0x1f;
  buf[1] = 0x8b;
  buf[2] = 8; // deflate
  buf[3] = 0x04; // FEXTRA only
  buf[9] = 255; // OS unknown
  dv.setUint16(10, xlen, true);

  let o = 12;
  buf[o] = 0x52; // 'R'
  buf[o + 1] = 0x41; // 'A'
  dv.setUint16(o + 2, raDataLen, true);
  o += 4;
  dv.setUint16(o, 1, true); // VER
  o += 2;
  dv.setUint16(o, chunkLength, true); // CHLEN
  o += 2;
  dv.setUint16(o, chcnt, true); // CHCNT
  o += 2;
  for (const c of compressed) {
    dv.setUint16(o, c.length, true);
    o += 2;
  }
  // o === headerLen
  for (const c of compressed) {
    buf.set(c, o);
    o += c.length;
  }
  return buf.subarray(0, o);
}

/** Serve a buffer over a mocked fetch that honours Range requests. */
function mockRangeFetch(buf: Uint8Array): void {
  vi.stubGlobal('fetch', async (_url: string, opts?: { headers?: Record<string, string> }) => {
    const range = opts?.headers?.Range ?? '';
    const m = /bytes=(\d+)-(\d+)/.exec(range);
    let slice: Uint8Array;
    if (m) {
      const start = Number(m[1]);
      const end = Number(m[2]);
      slice = buf.subarray(start, Math.min(end + 1, buf.length));
    } else {
      slice = buf;
    }
    const copy = slice.slice();
    return {
      ok: true,
      status: 206,
      arrayBuffer: async () => copy.buffer,
    } as Response;
  });
}

describe('DictZip header parser', () => {
  it('reads CHLEN / CHCNT / compressed-length table little-endian', () => {
    const content = new TextEncoder().encode('A'.repeat(50) + 'B'.repeat(50));
    const buf = buildDictzip(content, 30); // 100 bytes / 30 => 4 chunks
    const header = new ShaekeebDictZipHeaderParser().parseHeader(buf);

    expect(header.chunkLength).toBe(30);
    expect(header.chunkCount).toBe(4);
    expect(header.chunkCompLengths.length).toBe(4);
    // First chunk begins right after the full gzip header:
    // 10 (base) + 2 (XLEN) + [4 (SI1/SI2/LEN) + 6 (VER/CHLEN/CHCNT) + 4*2 (table)] = 30.
    expect(header.cumOffsets[0]).toBe(30);
    // cumOffsets are strictly increasing by each chunk's compressed length.
    for (let i = 1; i < header.chunkCount; i++) {
      expect(header.cumOffsets[i]).toBe(header.cumOffsets[i - 1] + header.chunkCompLengths[i - 1]);
    }
  });

  it('rejects a non-gzip buffer', () => {
    const parser = new ShaekeebDictZipHeaderParser();
    expect(() => parser.parseHeader(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toThrow();
  });
});

describe('DictZip block reader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads exact bytes, including across a chunk boundary', async () => {
    // Distinct content so off-by-one / wrong-chunk bugs are obvious.
    const content = new Uint8Array(256);
    for (let i = 0; i < content.length; i++) {
      content[i] = i & 0xff;
    }
    const chunkLength = 30;
    const buf = buildDictzip(content, chunkLength);
    mockRangeFetch(buf);

    const header = new ShaekeebDictZipHeaderParser().parseHeader(buf);
    const reader = new ShaekeebBlockReader('http://test/x.dict.dz', header, rawInflate);

    // Whole content.
    const all = await reader.readBytes(0, content.length);
    expect(Array.from(all)).toEqual(Array.from(content));

    // A range that straddles the chunk-1/chunk-2 boundary (offset 25..45).
    const cross = await reader.readBytes(25, 20);
    expect(Array.from(cross)).toEqual(Array.from(content.subarray(25, 45)));

    // A range fully inside the last chunk.
    const tail = await reader.readBytes(250, 6);
    expect(Array.from(tail)).toEqual(Array.from(content.subarray(250, 256)));
  });
});
