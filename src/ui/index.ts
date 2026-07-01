/**
 * HyperDict UI - one-call mounting of the popup + triggers over an engine
 * Authored by Shakeeb Ahmad
 */

import type { HyperDict } from '../core/engine';
import { ShakeebDictPopup, type PopupTab } from './popup';
import { attachTriggers } from './triggers';

export interface MountOptions {
  /** An initialized (or about-to-be) HyperDict engine. */
  engine: HyperDict;
  /** Dictionary tabs to show, in order. The first is the default. */
  dictionaries: PopupTab[];
  /** Search-box placeholder (e.g. "تلاش کریں" for Urdu). */
  placeholder?: string;
  /** Text direction for words/definitions. Default 'rtl'. */
  dir?: 'rtl' | 'ltr';
  /** Element to watch for gestures. Default document.body. */
  root?: HTMLElement;
  /** Enable the desktop selection chip. Default true. */
  selection?: boolean;
  /** Enable mobile long-press. Default true. */
  longPress?: boolean;
  /** Long-press threshold in ms. Default 450. */
  longPressMs?: number;
}

export interface MountedUI {
  popup: ShakeebDictPopup;
  /** Programmatically open the popup for a word. */
  open: (word: string) => void;
  /** Remove all listeners and DOM created by the UI. */
  destroy: () => void;
}

export function mountHyperDictUI(options: MountOptions): MountedUI {
  const { engine, dictionaries } = options;

  const popup = new ShakeebDictPopup({
    tabs: dictionaries,
    placeholder: options.placeholder,
    dir: options.dir,
    lookup: (word) => engine.lookup(word).dictionaries,
    getDefinition: (dictName, word) => engine.getDefinition(dictName, word),
  });

  const detachTriggers = attachTriggers({
    root: options.root,
    selection: options.selection,
    longPress: options.longPress,
    longPressMs: options.longPressMs,
    ignore: (target) => popup.contains(target),
    onLookup: (word) => popup.open(word),
  });

  return {
    popup,
    open: (word) => popup.open(word),
    destroy: () => {
      detachTriggers();
      popup.destroy();
    },
  };
}

export { ShakeebDictPopup } from './popup';
export type { PopupTab, PopupOptions, PopupCallbacks } from './popup';
export { attachTriggers } from './triggers';
export type { TriggerOptions } from './triggers';
