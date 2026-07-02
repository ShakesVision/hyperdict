/**
 * Tests for copy/output formatting and the minimal tar reader.
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect } from 'vitest';
import { htmlToPlain, formatOne, formatMany } from '../src/ui/output-format';
import { untar, isTar } from '../src/io/untar';
import type { DefinitionResult } from '../src/core/types';

const h = (w: string, def: string): DefinitionResult => ({ word: w, definition: def, dictName: 'D', type: 'h' });
const m = (w: string, def: string): DefinitionResult => ({ word: w, definition: def, dictName: 'D', type: 'm' });

describe('htmlToPlain', () => {
  it('converts breaks/lists/entities and strips tags', () => {
    const out = htmlToPlain('<p>a<br>b</p><ul><li>x</li><li>y</li></ul>&amp; z');
    expect(out).toContain('a\nb');
    expect(out).toContain('• x');
    expect(out).toContain('• y');
    expect(out).toContain('& z');
    expect(out).not.toMatch(/<[^>]+>/); // no tags remain
  });
});

describe('formatOne', () => {
  it('plain flattens HTML; markdown/html keep structure', () => {
    expect(formatOne(h('cat', '<b>feline</b>'), 'plain')).toBe('cat\nfeline\n');
    expect(formatOne(m('cat', 'feline'), 'markdown')).toBe('### cat\n\nfeline\n');
    expect(formatOne(h('cat', '<b>feline</b>'), 'html')).toContain('<h3>cat</h3>');
  });
});

describe('formatMany', () => {
  const entries = [
    { label: 'Urdu Lughat', result: m('علم', 'knowledge') },
    { label: 'Thesaurus', result: m('علم', 'science, learning') },
  ];
  it('plain uses ── headings, markdown uses ##, html uses sections', () => {
    const plain = formatMany('علم', entries, 'plain');
    expect(plain).toContain('── Urdu Lughat ──');
    expect(plain).toContain('── Thesaurus ──');

    const md = formatMany('علم', entries, 'markdown');
    expect(md).toContain('# علم');
    expect(md).toContain('## Urdu Lughat');

    const html = formatMany('علم', entries, 'html');
    expect(html).toContain('<h2>علم</h2>');
    expect(html).toContain('<h3>Thesaurus</h3>');
  });
});

/** Build a minimal USTAR tar for one file. */
function buildTar(name: string, data: Uint8Array): Uint8Array {
  const enc = new TextEncoder();
  const header = new Uint8Array(512);
  header.set(enc.encode(name), 0);
  header.set(enc.encode('0000644\0'), 100);
  header.set(enc.encode('0000000\0'), 108);
  header.set(enc.encode('0000000\0'), 116);
  header.set(enc.encode(data.length.toString(8).padStart(11, '0') + '\0'), 124);
  header.set(enc.encode('00000000000\0'), 136);
  header[156] = 0x30; // regular file
  header.set(enc.encode('ustar\0'), 257);
  header.set(enc.encode('00'), 263);
  for (let i = 148; i < 156; i++) header[i] = 0x20; // checksum field = spaces
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += header[i];
  header.set(enc.encode(sum.toString(8).padStart(6, '0') + '\0'), 148);
  header[155] = 0x20;

  const dataBlock = new Uint8Array(Math.ceil(data.length / 512) * 512);
  dataBlock.set(data, 0);
  const out = new Uint8Array(512 + dataBlock.length + 1024); // + 2 zero blocks
  out.set(header, 0);
  out.set(dataBlock, 512);
  return out;
}

describe('untar', () => {
  it('extracts a regular file and detects the ustar magic', () => {
    const enc = new TextEncoder();
    const tar = buildTar('MyDict.ifo', enc.encode('hello world'));
    expect(isTar(tar)).toBe(true);

    const entries = untar(tar);
    expect(Object.keys(entries)).toContain('MyDict.ifo');
    expect(new TextDecoder().decode(entries['MyDict.ifo'])).toBe('hello world');
  });
});
