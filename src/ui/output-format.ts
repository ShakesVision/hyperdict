/**
 * Definition output formatting for copy/export
 * Authored by Shakeeb Ahmad
 *
 * Turns one or many definitions into plain text, Markdown, or HTML. The plain
 * path converts HTML definitions to tidy text (line breaks preserved, tags and
 * entities resolved) without a DOM parse, so it stays fast and dependency-free.
 */

import type { DefinitionResult } from '../core/types';
import { escapeHtml } from './format';

export type OutputFormat = 'plain' | 'markdown' | 'html';

const MARKUP = new Set(['h', 'g', 'x']);
const isMarkup = (t?: string): boolean => !!t && MARKUP.has(t);

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

/** HTML → readable plain text (block tags → newlines, list items → bullets). */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|tr|h[1-6]|ul|ol|table|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The definition body as plain text (HTML types get flattened). */
export function definitionToPlain(r: DefinitionResult): string {
  return isMarkup(r.type) ? htmlToPlain(r.definition) : r.definition.trim();
}

/** Format a single dictionary's result. */
export function formatOne(r: DefinitionResult, fmt: OutputFormat): string {
  if (fmt === 'html') {
    const body = isMarkup(r.type) ? r.definition : `<p>${escapeHtml(r.definition)}</p>`;
    return `<h3>${escapeHtml(r.word)}</h3>\n${body}\n`;
  }
  if (fmt === 'markdown') {
    return `### ${r.word}\n\n${definitionToPlain(r)}\n`;
  }
  return `${r.word}\n${definitionToPlain(r)}\n`;
}

/** Format the same word across several dictionaries, each with a heading. */
export function formatMany(
  word: string,
  entries: Array<{ label: string; result: DefinitionResult }>,
  fmt: OutputFormat
): string {
  if (fmt === 'html') {
    const sections = entries
      .map(({ label, result }) => {
        const body = isMarkup(result.type) ? result.definition : `<p>${escapeHtml(result.definition)}</p>`;
        return `<section>\n<h3>${escapeHtml(label)}</h3>\n${body}\n</section>`;
      })
      .join('\n');
    return `<h2>${escapeHtml(word)}</h2>\n${sections}\n`;
  }
  if (fmt === 'markdown') {
    const sections = entries
      .map(({ label, result }) => `## ${label}\n\n${definitionToPlain(result)}`)
      .join('\n\n');
    return `# ${word}\n\n${sections}\n`;
  }
  const sections = entries
    .map(({ label, result }) => `── ${label} ──\n${definitionToPlain(result)}`)
    .join('\n\n');
  return `${word}\n\n${sections}\n`;
}

/** Copy text to the clipboard, with a legacy fallback. Resolves true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
