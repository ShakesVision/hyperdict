/**
 * Tests for: combining duplicate-headword entries, autocomplete (suggest),
 * and reverse lookup (search within meanings).
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { zipSync } from 'fflate';
import { Dictionary } from '../src/dict/dictionary';
import { rawInflate } from '../src/dictzip/inflate';

const enc = new TextEncoder();

/** Build a StarDict (uncompressed .dict, sametypesequence=m) from word/def pairs (already sorted). */
function build(words: Array<{ w: string; def: string }>): { ifo: Uint8Array; idx: Uint8Array; dict: Uint8Array } {
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

async function loadDict(words: Array<{ w: string; def: string }>): Promise<Dictionary> {
  const files = build(words);
  const zip = zipSync({ 'T.ifo': files.ifo, 'T.idx': files.idx, 'T.dict': files.dict });
  const ab = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, arrayBuffer: async () => ab }) as Response);
  return Dictionary.load({ name: 'T', archive: 'http://x/t.zip' }, { inflate: rawInflate });
}

const WORDS = [
  { w: 'apple', def: 'a red fruit' },
  { w: 'apple', def: 'a tech company' }, // duplicate headword, different sense
  { w: 'apricot', def: 'an orange fruit' },
  { w: 'banana', def: 'a yellow fruit' },
];

describe('duplicate headword entries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('combines all byte-identical headword entries', async () => {
    const d = await loadDict(WORDS);
    const def = await d.getDefinition('apple');
    expect(def).not.toBeNull();
    expect(def!.definition).toContain('a red fruit');
    expect(def!.definition).toContain('a tech company');
  });
});

describe('suggest (autocomplete)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns prefix matches, collapsing duplicate headwords', async () => {
    const d = await loadDict(WORDS);
    expect(d.suggest('ap', 10)).toEqual(['apple', 'apricot']); // single 'apple'
    expect(d.suggest('ban', 10)).toEqual(['banana']);
    expect(d.suggest('zzz', 10)).toEqual([]);
  });
});

describe('reverseLookup (search within meanings)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('finds unique headwords whose definition contains the query', async () => {
    const d = await loadDict(WORDS);
    const hits = await d.reverseLookup('fruit', { limit: 10 });
    expect(hits.sort()).toEqual(['apple', 'apricot', 'banana']);

    const tech = await d.reverseLookup('company', { limit: 10 });
    expect(tech).toEqual(['apple']);

    expect(await d.reverseLookup('zzz', { limit: 10 })).toEqual([]);
  });

  it('respects the limit', async () => {
    const d = await loadDict(WORDS);
    const hits = await d.reverseLookup('fruit', { limit: 2 });
    expect(hits.length).toBe(2);
  });
});
