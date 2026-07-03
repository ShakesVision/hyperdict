/**
 * UI Triggers - show a "look up" chip when the user selects text
 * Authored by Shakeeb Ahmad
 *
 * On BOTH desktop and mobile, selecting text surfaces a small floating chip
 * (search icon by default, customizable) near the selection; tapping it looks
 * the selection up. We use `selectionchange` (not just `mouseup`) so it works
 * with touch selection too, and we sit ALONGSIDE the native Android/iOS
 * selection menu rather than replacing it — the user can still copy/share/etc.
 *
 * Long-press-to-define is available but OFF by default: on touch it collides
 * with normal text selection (you'd trigger a lookup every time you tried to
 * select-and-copy), so selecting + tapping the chip is the better mobile UX.
 *
 * Framework-agnostic, no dependencies. attachTriggers returns a detach()
 * function that removes every listener and DOM node it created.
 */

import { icon } from './icons';

export interface TriggerOptions {
  /** Element to watch. Default: document.body. */
  root?: HTMLElement;
  /** Show the selection chip. Default true (works on desktop + mobile). */
  selection?: boolean;
  /** Also fire a lookup on long-press. Default false (collides with selection). */
  longPress?: boolean;
  longPressMs?: number;
  /** Ignore selections longer than this many chars. Default 100. */
  maxSelectionLength?: number;
  /** HTML for the chip contents (emoji/text/SVG). Default: a search icon. */
  chipLabel?: string;
  /** Called with the detected word/phrase and the viewport point of the gesture. */
  onLookup: (word: string, point: { x: number; y: number }) => void;
  /** Return true for elements whose gestures should be ignored (e.g. the popup). */
  ignore?: (target: EventTarget | null) => boolean;
}

type CaretCapableDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

/** Matches a "word" run: Unicode letters/marks/digits + ZWNJ/ZWJ (Urdu-safe). */
const WORD_RE = /[\p{L}\p{M}\p{N}‌‍]/u;

function wordAround(text: string, pos: number): string {
  if (!text) return '';
  let start = Math.min(pos, text.length);
  let end = start;
  while (start > 0 && WORD_RE.test(text[start - 1])) start--;
  while (end < text.length && WORD_RE.test(text[end])) end++;
  return text.slice(start, end).trim();
}

function wordAtPoint(x: number, y: number): string {
  const doc = document as CaretCapableDocument;
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
      return wordAround(range.startContainer.textContent ?? '', range.startOffset);
    }
  }
  if (typeof doc.caretPositionFromPoint === 'function') {
    const caret = doc.caretPositionFromPoint(x, y);
    if (caret && caret.offsetNode.nodeType === Node.TEXT_NODE) {
      return wordAround(caret.offsetNode.textContent ?? '', caret.offset);
    }
  }
  return '';
}

export function attachTriggers(opts: TriggerOptions): () => void {
  const root = opts.root ?? document.body;
  const useSelection = opts.selection !== false;
  const useLongPress = opts.longPress === true; // opt-in
  const longPressMs = opts.longPressMs ?? 450;
  const maxLen = opts.maxSelectionLength ?? 100;
  const ignore = opts.ignore ?? (() => false);

  // --- floating "look up" chip ---
  let chip: HTMLButtonElement | null = null;
  let pending = '';

  function removeChip(): void {
    if (chip) {
      chip.remove();
      chip = null;
    }
    pending = '';
  }

  function ensureChip(): HTMLButtonElement {
    if (chip) return chip;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Look up selection');
    btn.innerHTML = opts.chipLabel ?? icon('search', 18);
    Object.assign(btn.style, {
      position: 'fixed',
      zIndex: '2147483646',
      minWidth: '34px',
      height: '34px',
      padding: '0 8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '17px',
      border: '1px solid #000',
      background: '#fff',
      color: '#000',
      cursor: 'pointer',
      boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
      font: '15px/1 sans-serif',
    } as Partial<CSSStyleDeclaration>);
    // pointerdown (not click) so it fires before the selection/menu dismisses it.
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const word = pending;
      const rect = btn.getBoundingClientRect();
      removeChip();
      if (word) opts.onLookup(word, { x: rect.left, y: rect.top });
    });
    document.body.appendChild(btn);
    chip = btn;
    return btn;
  }

  function positionChip(rect: DOMRect): void {
    const btn = ensureChip();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Prefer below the selection (keeps clear of the native menu, which usually
    // appears above the selection); flip above if there's no room.
    const x = rect.left;
    let y = rect.bottom + 8;
    if (y > vh - 44) y = rect.top - 42;
    btn.style.left = `${Math.min(Math.max(x, 8), vw - 44)}px`;
    btn.style.top = `${Math.min(Math.max(y, 8), vh - 44)}px`;
  }

  function evaluateSelection(): void {
    if (!useSelection) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      removeChip();
      return;
    }
    const text = sel.toString().trim();
    if (!text || text.length > maxLen) {
      removeChip();
      return;
    }
    if (ignore(sel.anchorNode) || (sel.anchorNode && !root.contains(sel.anchorNode))) {
      removeChip();
      return;
    }
    pending = text;
    positionChip(sel.getRangeAt(0).getBoundingClientRect());
  }

  // selectionchange is the reliable cross-platform signal (fires for touch too).
  let selTimer: ReturnType<typeof setTimeout> | null = null;
  function onSelectionChange(): void {
    if (selTimer) clearTimeout(selTimer);
    selTimer = setTimeout(evaluateSelection, 220);
  }
  // Re-check right after a pointer gesture ends (snappier on desktop).
  function onPointerUp(e: Event): void {
    if (ignore(e.target)) return;
    setTimeout(evaluateSelection, 0);
  }

  // --- optional long-press ---
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let pressStart: { x: number; y: number } | null = null;
  function clearPress(): void {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    pressStart = null;
  }
  function onTouchStart(e: TouchEvent): void {
    if (!useLongPress || ignore(e.target) || e.touches.length !== 1) return;
    const t = e.touches[0];
    pressStart = { x: t.clientX, y: t.clientY };
    pressTimer = setTimeout(() => {
      if (!pressStart) return;
      const word = wordAtPoint(pressStart.x, pressStart.y);
      const point = { ...pressStart };
      clearPress();
      if (word) opts.onLookup(word, point);
    }, longPressMs);
  }
  function onTouchMove(e: TouchEvent): void {
    if (!pressStart) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - pressStart.x) > 10 || Math.abs(t.clientY - pressStart.y) > 10) {
      clearPress();
    }
  }

  function onScrollOrResize(): void {
    removeChip();
  }

  if (useSelection) {
    document.addEventListener('selectionchange', onSelectionChange);
    root.addEventListener('mouseup', onPointerUp);
    root.addEventListener('touchend', onPointerUp);
  }
  if (useLongPress) {
    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: true });
    root.addEventListener('touchend', clearPress);
    root.addEventListener('touchcancel', clearPress);
  }
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  return function detach(): void {
    document.removeEventListener('selectionchange', onSelectionChange);
    root.removeEventListener('mouseup', onPointerUp);
    root.removeEventListener('touchend', onPointerUp);
    root.removeEventListener('touchstart', onTouchStart);
    root.removeEventListener('touchmove', onTouchMove);
    root.removeEventListener('touchend', clearPress);
    root.removeEventListener('touchcancel', clearPress);
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize);
    clearPress();
    removeChip();
  };
}
