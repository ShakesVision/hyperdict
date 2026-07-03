/**
 * Guards the direct (no-string-roundtrip) .idx parser and multi-field
 * sametypesequence decoding.
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { zipSync } from 'fflate';
import { ShakeebIdxParser } from '../src/index/idx-parser';
import { TypedIndexReader } from '../src/index/typed-index';
import { Dictionary } from '../src/dict/dictionary';
import { rawInflate } from '../src/dictzip/inflate';

const enc = new TextEncoder();

function buildIdx(entries: Array<{ w: string; off: number; size: number }>): Uint8Array {
  const parts = entries.map((e) => {
    const wb = enc.encode(e.w);
    const rec = new Uint8Array(wb.length + 1 + 8);
    rec.set(wb, 0);
    const dv = new DataView(rec.buffer);
    dv.setUint32(wb.length + 1, e.off, false);
    dv.setUint32(wb.length + 5, e.size, false);
    return rec;
  });
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe('ShakeebIdxParser.parseIdx (direct build)', () => {
  const entries = [
    { w: 'apple', off: 0, size: 7 },
    { w: 'کتاب', off: 7, size: 20 }, // multi-byte UTF-8 word
    { w: 'zebra', off: 27, size: 5 },
  ];

  it('parses words, offsets and sizes correctly', () => {
    const idx = new ShakeebIdxParser().parseIdx(buildIdx(entries));
    const reader = new TypedIndexReader(idx);

    expect(idx.wordOffsets.length).toBe(3);
    expect(reader.getWordString(0)).toBe('apple');
    expect(reader.getWordString(1)).toBe('کتاب');
    expect(reader.getWordString(2)).toBe('zebra');
    expect(Array.from(idx.offsetArray)).toEqual([0, 7, 27]);
    expect(Array.from(idx.lengthArray)).toEqual([7, 20, 5]);
  });

  it('handles a Uint8Array view with a non-zero byteOffset (zip extraction case)', () => {
    const raw = buildIdx(entries);
    const padded = new Uint8Array(raw.length + 5);
    padded.set(raw, 5);
    const view = padded.subarray(5); // byteOffset = 5

    const idx = new ShakeebIdxParser().parseIdx(view);
    const reader = new TypedIndexReader(idx);
    expect(idx.wordOffsets.length).toBe(3);
    expect(reader.getWordString(1)).toBe('کتاب');
    expect(Array.from(idx.offsetArray)).toEqual([0, 7, 27]);
  });
});

describe('multi-field sametypesequence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('decodes "mh": NUL-terminated text field + trailing HTML field', async () => {
    // .dict entry = "plain" \0 "<b>hi</b>"   (m field, then h field to end)
    const field0 = enc.encode('plain');
    const field1 = enc.encode('<b>hi</b>');
    const dict = new Uint8Array(field0.length + 1 + field1.length);
    dict.set(field0, 0);
    dict[field0.length] = 0;
    dict.set(field1, field0.length + 1);

    const wb = enc.encode('x');
    const rec = new Uint8Array(wb.length + 1 + 8);
    rec.set(wb, 0);
    new DataView(rec.buffer).setUint32(wb.length + 5, dict.length, false); // offset 0, size = full
    const ifo = enc.encode(
      `StarDict's dict ifo file\nversion=3.0.0\nbookname=MF\nwordcount=1\nidxfilesize=${rec.length}\nsametypesequence=mh\n`
    );

    const zip = zipSync({ 'MF.ifo': ifo, 'MF.idx': rec, 'MF.dict': dict });
    const ab = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength);
    vi.stubGlobal('fetch', async () => ({ ok: true, status: 200, arrayBuffer: async () => ab }) as Response);

    const d = await Dictionary.load({ name: 'MF', archive: 'http://x/mf.zip' }, { inflate: rawInflate });
    const def = await d.getDefinition('x');
    expect(def).not.toBeNull();
    expect(def!.type).toBe('h'); // markup field wins
    expect(def!.definition).toContain('plain');
    expect(def!.definition).toContain('<b>hi</b>');
  });
});
