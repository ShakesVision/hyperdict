/**
 * Tests for the two new content sources: an in-memory .zip archive and an
 * uncompressed .dict read over HTTP Range.
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { zipSync } from 'fflate';
import { Dictionary } from '../src/dict/dictionary';
import { rawInflate } from '../src/dictzip/inflate';

/** Build a minimal, sorted StarDict with an uncompressed .dict (sametypesequence=m). */
function buildStarDict(): { ifo: Uint8Array; idx: Uint8Array; dict: Uint8Array } {
  const enc = new TextEncoder();
  const words = [
    { w: 'apple', def: 'a fruit' },
    { w: 'banana', def: 'a yellow fruit' },
    { w: 'cat', def: 'a small animal' },
  ];

  const defBufs = words.map((x) => enc.encode(x.def));
  const dict = new Uint8Array(defBufs.reduce((a, b) => a + b.length, 0));
  const offsets: number[] = [];
  let o = 0;
  for (const b of defBufs) {
    offsets.push(o);
    dict.set(b, o);
    o += b.length;
  }

  const idxChunks: Uint8Array[] = words.map((x, i) => {
    const wb = enc.encode(x.w);
    const rec = new Uint8Array(wb.length + 1 + 8);
    rec.set(wb, 0);
    rec[wb.length] = 0;
    const dv = new DataView(rec.buffer);
    dv.setUint32(wb.length + 1, offsets[i], false); // BE offset
    dv.setUint32(wb.length + 5, defBufs[i].length, false); // BE size
    return rec;
  });
  const idx = new Uint8Array(idxChunks.reduce((a, b) => a + b.length, 0));
  let io = 0;
  for (const c of idxChunks) {
    idx.set(c, io);
    io += c.length;
  }

  const ifo = enc.encode(
    `StarDict's dict ifo file\nversion=3.0.0\nbookname=Test\nwordcount=${words.length}\nidxfilesize=${idx.length}\nsametypesequence=m\n`
  );
  return { ifo, idx, dict };
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

describe('archive (.zip) loading', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads .ifo/.idx/.dict from an in-memory zip and reads definitions', async () => {
    const sd = buildStarDict();
    const zip = zipSync({ 'Test.ifo': sd.ifo, 'Test.idx': sd.idx, 'Test.dict': sd.dict });

    vi.stubGlobal(
      'fetch',
      async () =>
        ({ ok: true, status: 200, arrayBuffer: async () => toArrayBuffer(zip) }) as Response
    );

    const dict = await Dictionary.load(
      { name: 'Test', archive: 'http://x/test.zip' },
      { inflate: rawInflate }
    );

    expect(dict.wordCount).toBe(3);
    expect(dict.has('banana')).toBe(true);
    expect(dict.has('grape')).toBe(false);

    const def = await dict.getDefinition('banana');
    expect(def?.definition).toBe('a yellow fruit');
    expect(def?.type).toBe('m');
  });
});

describe('uncompressed .dict over HTTP', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('falls back from .dict.dz to .dict and range-reads definitions', async () => {
    const sd = buildStarDict();
    const files: Record<string, Uint8Array> = {
      'http://x/Test.ifo': sd.ifo,
      'http://x/Test.idx': sd.idx,
      'http://x/Test.dict': sd.dict,
    };

    vi.stubGlobal(
      'fetch',
      async (url: string, opts?: { headers?: Record<string, string> }) => {
        // No .dict.dz exists → force the plain-.dict fallback path.
        if (url.endsWith('.dict.dz')) return { ok: false, status: 404 } as Response;

        const data = files[url];
        if (!data) return { ok: false, status: 404 } as Response;

        const range = opts?.headers?.Range;
        if (range) {
          const m = /bytes=(\d+)-(\d+)/.exec(range)!;
          const start = Number(m[1]);
          const end = Number(m[2]);
          const slice = data.subarray(start, Math.min(end + 1, data.length));
          return { ok: true, status: 206, arrayBuffer: async () => toArrayBuffer(slice) } as Response;
        }
        return { ok: true, status: 200, arrayBuffer: async () => toArrayBuffer(data) } as Response;
      }
    );

    const dict = await Dictionary.load({ name: 'Test', path: 'http://x/' }, { inflate: rawInflate });

    expect(dict.hasDefinitions).toBe(true);
    const def = await dict.getDefinition('apple');
    expect(def?.definition).toBe('a fruit');

    const def2 = await dict.getDefinition('cat');
    expect(def2?.definition).toBe('a small animal');
  });
});
