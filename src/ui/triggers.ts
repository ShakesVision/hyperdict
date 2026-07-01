/**
 * UI Triggers - text-selection and mobile long-press word detection
 * Authored by Shakeeb Ahmad
 *
 * Watches a root element for two gestures and reports the word/phrase to look up:
 *   - Desktop: select text → a small floating "lookup" chip appears near the
 *     selection; clicking it fires onLookup with the selected text.
 *   - Touch: long-press a word → the word under the finger is detected and
 *     onLookup fires immediately.
 *
 * Framework-agnostic, no dependencies. attachTriggers returns a detach()
 * function that removes every listener and DOM node it created.
 */

export interface TriggerOptions {
  /** Element to watch. Default: document.body. */
  root?: HTMLElement;
  /** Long-press duration in ms before a touch counts as a press. Default 450. */
  longPressMs?: number;
  /** Enable the desktop text-selection chip. Default true. */
  selection?: boolean;
  /** Enable mobile long-press detection. Default true. */
  longPress?: boolean;
  /** Called with the detected word/phrase and the viewport point of the gesture. */
  onLookup: (word: string, point: { x: number; y: number }) => void;
  /** Return true for elements whose gestures should be ignored (e.g. the popup). */
  ignore?: (target: EventTarget | null) => boolean;
}

type CaretCapableDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (
    x: number,
    y: number
  ) => { offsetNode: Node; offset: number } | null;
};

/** Matches a "word" run including Unicode letters, marks and digits (Urdu-safe). */
const WORD_RE = /[\p{L}\p{M}\p{N}]/u;

/** Expand a string around `pos` to the surrounding word using Unicode classes. */
function wordAround(text: string, pos: number): string {
  if (!text) return '';
  let start = Math.min(pos, text.length);
  let end = start;
  while (start > 0 && WORD_RE.test(text[start - 1])) start--;
  while (end < text.length && WORD_RE.test(text[end])) end++;
  return text.slice(start, end).trim();
}

/** Resolve the word at a viewport point using whichever caret API exists. */
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
  const longPressMs = opts.longPressMs ?? 450;
  const useSelection = opts.selection !== false;
  const useLongPress = opts.longPress !== false;
  const ignore = opts.ignore ?? (() => false);

  // --- floating lookup chip (desktop selection) ---
  let chip: HTMLButtonElement | null = null;
  let pendingSelection = '';

  function removeChip(): void {
    if (chip) {
      chip.remove();
      chip = null;
    }
    pendingSelection = '';
  }

  function showChip(x: number, y: number, word: string): void {
    pendingSelection = word;
    if (!chip) {
      chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = '🔍';
      chip.setAttribute('aria-label', 'Look up selection');
      Object.assign(chip.style, {
        position: 'fixed',
        zIndex: '2147483646',
        width: '32px',
        height: '32px',
        padding: '0',
        borderRadius: '4px',
        border: '1px solid #000',
        background: '#fff',
        color: '#000',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        font: '16px/1 sans-serif',
      } as Partial<CSSStyleDeclaration>);
      // Use mousedown so it fires before the selection clears on click.
      chip.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const word = pendingSelection;
        const rect = chip!.getBoundingClientRect();
        removeChip();
        if (word) opts.onLookup(word, { x: rect.left, y: rect.top });
      });
      document.body.appendChild(chip);
    }
    // Keep the chip on-screen.
    const cx = Math.min(Math.max(x, 8), window.innerWidth - 40);
    const cy = Math.min(Math.max(y - 40, 8), window.innerHeight - 40);
    chip.style.left = `${cx}px`;
    chip.style.top = `${cy}px`;
  }

  function onMouseUp(e: MouseEvent): void {
    if (!useSelection) return;
    if (ignore(e.target)) return;
    // Defer so the selection is finalized.
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text && text.length <= 80 && sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        showChip(rect.left + rect.width / 2, rect.top, text);
      } else {
        removeChip();
      }
    }, 0);
  }

  // --- long-press (touch) ---
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
    if (!useLongPress) return;
    if (ignore(e.target)) return;
    if (e.touches.length !== 1) return;
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

  root.addEventListener('mouseup', onMouseUp);
  root.addEventListener('touchstart', onTouchStart, { passive: true });
  root.addEventListener('touchmove', onTouchMove, { passive: true });
  root.addEventListener('touchend', clearPress);
  root.addEventListener('touchcancel', clearPress);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  return function detach(): void {
    root.removeEventListener('mouseup', onMouseUp);
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
