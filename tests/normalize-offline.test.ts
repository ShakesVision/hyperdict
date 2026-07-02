/**
 * Tests for diacritic-insensitive search and offline `preload` mode.
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { zipSync } from 'fflate';
import { Dictionary } from '../src/dict/dictionary';
import { rawInflate } from '../src/dictzip/inflate';
import { stripDiacritics, hasDiacritics } from '../src/dict/normalize';

const enc = new TextEncoder();

/** Build raw StarDict files (uncompressed .dict, sametypesequence=m) for a word list. */
function build(words: Array<{ w: string; def: string }>): {
  ifo: Uint8Array;
  idx: Uint8Array;
  dict: Uint8Array;
} {
  const defBufs = words.map((x) => enc.encode(x.def));
  const dict = new Uint8Array(defBufs.reduce((a, b) => a + b.length, 0));
  const offsets: number[] = [];
  let o = 0;
  for (const b of defBufs) {
    offsets.push(o);
    dict.set(b, o);
    o += b.length;
  }
  const chunks = words.map((x, i) => {
    const wb = enc.encode(x.w);
    const rec = new Uint8Array(wb.length + 1 + 8);
    rec.set(wb, 0);
    const dv = new DataView(rec.buffer);
    dv.setUint32(wb.length + 1, offsets[i], false);
    dv.setUint32(wb.length + 5, defBufs[i].length, false);
    return rec;
  });
  const idx = new Uint8Array(chunks.reduce((a, b) => a + b.length, 0));
  let io = 0;
  for (const c of chunks) {
    idx.set(c, io);
    io += c.length;
  }
  const ifo = enc.encode(
    `StarDict's dict ifo file\nversion=3.0.0\nbookname=T\nwordcount=${words.length}\nidxfilesize=${idx.length}\nsametypesequence=m\n`
  );
  return { ifo, idx, dict };
}

function mockZip(files: { ifo: Uint8Array; idx: Uint8Array; dict: Uint8Array }): void {
  const zip = zipSync({ 'T.ifo': files.ifo, 'T.idx': files.idx, 'T.dict': files.dict });
  const ab = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, arrayBuffer: async () => ab }) as Response);
}

describe('stripDiacritics', () => {
  it('removes harakat but keeps base letters and digits', () => {
    // علم + kasra/sukun → علم
    expect(stripDiacritics('عِلْم')).toBe('علم');
    expect(stripDiacritics('علم')).toBe('علم');
    expect(hasDiacritics('عِلْم')).toBe(true);
    expect(hasDiacritics('علم')).toBe(false);
    // Arabic-Indic digits must NOT be stripped.
    expect(stripDiacritics('٠١٢')).toBe('٠١٢');
  });
});

describe('diacritic-insensitive lookup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('finds a bare headword from a diacritic query (default, free)', async () => {
    mockZip(build([{ w: 'علم', def: 'knowledge' }]));
    const dict = await Dictionary.load({ name: 'T', archive: 'http://x/t.zip' }, { inflate: rawInflate });
    expect(dict.has('علم')).toBe(true);
    expect(dict.has('عِلْم')).toBe(true); // query carries diacritics
    const def = await dict.getDefinition('عِلْم');
    expect(def?.definition).toBe('knowledge');
  });

  it('finds a diacritic headword from a bare query when normalize:true', async () => {
    mockZip(build([{ w: 'عَلم', def: 'flag' }])); // headword carries a zabar
    const bare = await Dictionary.load(
      { name: 'T', archive: 'http://x/t.zip' },
      { inflate: rawInflate }
    );
    expect(bare.has('علم')).toBe(false); // no normalize map → bare query misses

    const norm = await Dictionary.load(
      { name: 'T', archive: 'http://x/t.zip' },
      { inflate: rawInflate, normalize: true }
    );
    expect(norm.has('علم')).toBe(true); // map resolves bare → diacritic headword
  });
});

describe('offline preload', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads definitions from a fully-downloaded .dict (no Range requests)', async () => {
    const files = build([
      { w: 'apple', def: 'a fruit' },
      { w: 'banana', def: 'yellow' },
    ]);
    const map: Record<string, Uint8Array> = {
      'http://x/T.ifo': files.ifo,
      'http://x/T.idx': files.idx,
      'http://x/T.dict': files.dict,
    };
    const rangeCalls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, opts?: { headers?: Record<string, string> }) => {
      if (opts?.headers?.Range) rangeCalls.push(url);
      if (url.endsWith('.dict.dz')) return { ok: false, status: 404 } as Response;
      const data = map[url];
      if (!data) return { ok: false, status: 404 } as Response;
      const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      return { ok: true, status: 200, arrayBuffer: async () => ab } as Response;
    });

    const dict = await Dictionary.load(
      { name: 'T', path: 'http://x/', preload: true },
      { inflate: rawInflate }
    );
    const def = await dict.getDefinition('banana');
    expect(def?.definition).toBe('yellow');
    // Preload must not use HTTP Range at all.
    expect(rangeCalls).toEqual([]);
  });
});
