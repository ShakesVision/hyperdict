/**
 * Tests for UI formatting helpers (pure, DOM-free).
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect } from 'vitest';
import { prettifyPlainText, resolveLinkWord, escapeHtml } from '../src/ui/format';

describe('escapeHtml', () => {
  it('escapes the dangerous characters', () => {
    expect(escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#039;');
  });
});

describe('prettifyPlainText', () => {
  it('splits ====== sense separators into blocks and escapes text', () => {
    const input = 'مانُوس ====== جانا پہچانا ====== <b>مانُوس</b>';
    const html = prettifyPlainText(input, 'sense');
    const blocks = html.match(/class="sense"/g) ?? [];
    expect(blocks.length).toBe(3);
    // Raw HTML in the source is escaped, not rendered.
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });

  it('keeps a single block and converts newlines to <br>', () => {
    const html = prettifyPlainText('line one\nline two');
    expect(html).toContain('line one<br>line two');
  });

  it('returns empty string for blank input', () => {
    expect(prettifyPlainText('   ')).toBe('');
  });
});

describe('resolveLinkWord', () => {
  it('decodes bword:// cross-references', () => {
    expect(resolveLinkWord('bword://%D9%BE%DB%8C%D8%A7%D8%B1%D8%A7')).toBe('پیارا');
    expect(resolveLinkWord('bword://cat')).toBe('cat');
  });

  it('treats bare relative links as headwords', () => {
    expect(resolveLinkWord('elephant')).toBe('elephant');
  });

  it('ignores external / anchor / mailto links', () => {
    expect(resolveLinkWord('https://example.com')).toBeNull();
    expect(resolveLinkWord('#top')).toBeNull();
    expect(resolveLinkWord('mailto:x@y.com')).toBeNull();
    expect(resolveLinkWord('')).toBeNull();
  });
});
