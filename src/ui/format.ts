/**
 * Formatting helpers for rendering StarDict definitions
 * Authored by Shakeeb Ahmad
 *
 * Pure, DOM-free string helpers so they can be reused by custom UIs too.
 */

import type { DefinitionResult } from '../core/types';

/** Per-dictionary render override. May return an HTML string or a DOM node. */
export type DefinitionTransform = (
  result: DefinitionResult,
  dictName: string
) => string | HTMLElement;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

export function escapeHtml(text: string): string {
  return String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Turn a plain-text (`type=m`) definition into tidy, readable HTML.
 *
 * Many dictionaries (e.g. UDB Lughat Kabeer) stuff several senses into one line
 * separated by runs of "=" and with no newlines, which renders as an unreadable
 * wall of text. We split on those separators into sense blocks, preserve any
 * real newlines, collapse pathological whitespace, and HTML-escape everything
 * (the input is plain text, never markup).
 */
export function prettifyPlainText(text: string, senseClass = 'shk-dict-sense'): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return '';
  }
  const senses = normalized
    .split(/\s*={3,}\s*/) // "======" sense separators
    .map((s) => s.trim())
    .filter(Boolean);

  const blocks = senses.length > 0 ? senses : [normalized];
  return blocks
    .map((block) => {
      const safe = escapeHtml(block)
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n/g, '<br>');
      return `<div class="${senseClass}">${safe}</div>`;
    })
    .join('');
}

/**
 * Interpret a link href found inside a definition. Returns the target headword
 * for GoldenDict-style `bword://` links and bare relative links, or null for
 * external/anchor links (which should keep their default behavior).
 */
export function resolveLinkWord(href: string): string | null {
  if (!href) return null;
  const trimmed = href.trim();

  // GoldenDict cross-reference scheme.
  const bword = /^bword:\/\/?/i;
  if (bword.test(trimmed)) {
    try {
      return decodeURIComponent(trimmed.replace(bword, '')).trim() || null;
    } catch {
      return trimmed.replace(bword, '').trim() || null;
    }
  }

  // Anchors / external / mail / js — leave alone.
  if (/^(#|https?:|mailto:|tel:|javascript:|data:)/i.test(trimmed)) {
    return null;
  }

  // A bare relative reference is treated as a headword lookup.
  try {
    return decodeURIComponent(trimmed).trim() || null;
  } catch {
    return trimmed || null;
  }
}
