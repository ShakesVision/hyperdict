/**
 * Tests for the dictionary-set model (enable/disable/remove/reset), the
 * idxoffsetbits guard, and the O(log n) case-insensitive search.
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { zipSync } from 'fflate';
import { HyperDict } from '../src/core/engine';
import { Dictionary } from '../src/dict/dictionary';
import { rawInflate } from '../src/dictzip/inflate';
import { ShaekeebTypedIndexBuilder } from '../src/index/typed-index';
import { ShaekeebBinarySearch } from '../src/algorithms/binary-search';

const enc = new TextEncoder();

/** Minimal StarDict (uncompressed .dict) as raw file buffers. */
function starDictFiles(extraIfo = ''): { ifo: Uint8Array; idx: Uint8Array; dict: Uint8Array } {
  const words = [
    { w: 'apple', def: 'a fruit' },
    { w: 'banana', def: 'a yellow fruit' },
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
    `StarDict's dict ifo file\nversion=3.0.0\nbookname=Test\nwordcount=${words.length}\nidxfilesize=${idx.length}\nsametypesequence=m\n${extraIfo}`
  );
  return { ifo, idx, dict };
}

function mockZip(files: { ifo: Uint8Array; idx: Uint8Array; dict: Uint8Array }): void {
  const zip = zipSync({ 'Test.ifo': files.ifo, 'Test.idx': files.idx, 'Test.dict': files.dict });
  const ab = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
  vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, arrayBuffer: async () => ab }) as Response);
}

describe('idxoffsetbits guard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects a 64-bit-offset dictionary with a clear error', async () => {
    mockZip(starDictFiles('idxoffsetbits=64\n'));
    await expect(
      Dictionary.load({ name: 'Big', archive: 'http://x/big.zip' }, { inflate: rawInflate })
    ).rejects.toThrow(/idxoffsetbits/);
  });
});

describe('dictionary-set model', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('enable/disable/remove/reset behave correctly', async () => {
    mockZip(starDictFiles());
    const engine = new HyperDict();
    engine.registerDictionary({ name: 'Default1', archive: 'http://x/d1.zip' }); // default origin
    await engine.init();

    // Loaded default present.
    expect(engine.listDictionaries().map((d) => [d.name, d.origin, d.enabled, d.loaded])).toEqual([
      ['Default1', 'default', true, true],
    ]);
    expect(engine.lookup('apple').dictionaries.find((d) => d.name === 'Default1')?.found).toBe(true);

    // Disable → unloaded, not searched, but still known.
    await engine.setEnabled('Default1', false);
    expect(engine.hasDictionary('Default1')).toBe(false);
    expect(engine.hasConfig('Default1')).toBe(true);
    expect(engine.listDictionaries()[0].enabled).toBe(false);
    expect(engine.lookup('apple').dictionaries.length).toBe(0);

    // Re-enable → reloaded.
    await engine.setEnabled('Default1', true);
    expect(engine.hasDictionary('Default1')).toBe(true);

    // Add a custom dictionary.
    await engine.addDictionary({ name: 'Custom1', archive: 'http://x/c1.zip' });
    expect(engine.exportConfig('custom').map((c) => c.name)).toEqual(['Custom1']);
    expect(engine.exportConfig('default').map((c) => c.name)).toEqual(['Default1']);

    // Reset → custom removed, defaults kept & enabled.
    await engine.resetToDefaults();
    expect(engine.listDictionaries().map((d) => d.name)).toEqual(['Default1']);
    expect(engine.hasConfig('Custom1')).toBe(false);
  });

  it('init() is re-entrancy safe (concurrent calls load once)', async () => {
    mockZip(starDictFiles());
    const engine = new HyperDict();
    engine.registerDictionary({ name: 'D', archive: 'http://x/d.zip' });
    await Promise.all([engine.init(), engine.init(), engine.init()]);
    expect(engine.getStats().dictionaryCount).toBe(1);
  });
});

describe('case-insensitive binary search', () => {
  it('finds case variants in O(log n) on a case-insensitively-sorted index', () => {
    const builder = new ShaekeebTypedIndexBuilder();
    // g_ascii_strcasecmp order: Apple/apple (tie → byte), then BANANA, then cat.
    ['Apple', 'apple', 'BANANA', 'cat'].forEach((w, i) => builder.addEntry(w, i, 1));
    const search = new ShaekeebBinarySearch(builder.build());

    const ai = search.findWordCaseInsensitive('APPLE');
    expect(ai === 0 || ai === 1).toBe(true);
    expect(search.findWordCaseInsensitive('banana')).toBe(2);
    expect(search.findWordCaseInsensitive('Cat')).toBe(3);
    expect(search.findWordCaseInsensitive('dog')).toBe(-1);
  });
});
