/**
 * HyperDict UI - one-call mounting of the popup + triggers over an engine
 * Authored by Shakeeb Ahmad
 *
 * Wires the reusable pieces together:
 *   - builds tab metadata (label / direction / font) from each dictionary's config
 *   - powers the ⓘ info panel from the .ifo metadata
 *   - persists recent searches + the dictionary set (custom dicts + disabled state)
 *   - opens the Manage panel: enable/disable, add, delete (custom), reset
 *
 * For persistence of the dictionary set across reloads, call
 * `restoreDictionaryState(engine)` BEFORE `engine.init()` (see its docs).
 */

import type { HyperDict } from '../core/engine';
import type { DictionaryConfig } from '../core/types';
import { ShakeebDictPopup, type PopupTab, type DictInfo } from './popup';
import { attachTriggers } from './triggers';
import { SearchHistory } from './history';
import { ManageDictionariesPanel, type ManageRow } from './manage';
import type { DefinitionTransform } from './format';

const RTL_LANGS = new Set(['ur', 'ar', 'fa', 'he', 'ps', 'sd', 'ug', 'ckb']);
const DEFAULT_CONFIG_KEY = 'hyperdict:dicts';
const DEFAULT_DISABLED_KEY = 'hyperdict:disabled';

export interface MountOptions {
  engine: HyperDict;
  /** Explicit tab overrides. If omitted, tabs are derived from the engine's dictionaries. */
  dictionaries?: PopupTab[];
  placeholder?: string;
  /** Default direction when a dictionary doesn't declare/imply one. Default 'rtl'. */
  dir?: 'rtl' | 'ltr';
  htmlTypes?: string[];
  transform?: DefinitionTransform;
  /** Recent-search cap. Default 50. */
  historyLimit?: number;
  /** localStorage key for recent searches. Default 'hyperdict:recent'. null = in-memory. */
  historyKey?: string | null;
  /** Attribution shown in the info panel. Default: HyperDict credit. */
  attribution?: boolean | { text: string; url?: string };
  /** Show the Manage-dictionaries panel (＋ button). Default true. */
  manage?: boolean;
  /** localStorage key for custom dictionaries. Default 'hyperdict:dicts'. null = off. */
  persistConfigKey?: string | null;
  /** localStorage key for the disabled-set. Default 'hyperdict:disabled'. null = off. */
  disabledKey?: string | null;
  root?: HTMLElement;
  selection?: boolean;
  longPress?: boolean;
  longPressMs?: number;
}

export interface MountedUI {
  popup: ShakeebDictPopup;
  open: (word: string) => void;
  /** Rebuild tabs from the engine (call after programmatic add/remove). */
  refresh: () => void;
  destroy: () => void;
}

function dirFor(config: DictionaryConfig, fallback: 'rtl' | 'ltr'): 'rtl' | 'ltr' {
  if (config.dir) return config.dir;
  if (config.lang) return RTL_LANGS.has(config.lang) ? 'rtl' : 'ltr';
  return fallback;
}

/**
 * Restore a previously-persisted dictionary set. Registers custom dictionaries
 * (lazily) and marks disabled ones, so a following `engine.init()` loads exactly
 * the right set (no load-then-unload). Safe to call with no stored state.
 *
 * Call this AFTER registering your default dictionaries and BEFORE `init()`:
 *
 *   DEFAULTS.forEach((d) => engine.registerDictionary(d));
 *   restoreDictionaryState(engine);
 *   await engine.init();
 */
export function restoreDictionaryState(
  engine: HyperDict,
  opts: { persistConfigKey?: string | null; disabledKey?: string | null } = {}
): void {
  if (typeof localStorage === 'undefined') return;
  const cfgKey = opts.persistConfigKey === undefined ? DEFAULT_CONFIG_KEY : opts.persistConfigKey;
  const disKey = opts.disabledKey === undefined ? DEFAULT_DISABLED_KEY : opts.disabledKey;

  if (cfgKey) {
    try {
      const raw = localStorage.getItem(cfgKey);
      const arr: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr)) {
        for (const c of arr as DictionaryConfig[]) {
          if (c && c.name && !engine.hasConfig(c.name)) {
            engine.registerDictionary(c, 'custom');
          }
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  if (disKey) {
    try {
      const raw = localStorage.getItem(disKey);
      const arr: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr)) {
        for (const name of arr as string[]) {
          if (typeof name === 'string' && engine.hasConfig(name)) {
            void engine.setEnabled(name, false);
          }
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }
}

export function mountHyperDictUI(options: MountOptions): MountedUI {
  const { engine } = options;
  const defaultDir = options.dir ?? 'rtl';
  const cfgKey =
    options.persistConfigKey === undefined ? DEFAULT_CONFIG_KEY : options.persistConfigKey;
  const disKey = options.disabledKey === undefined ? DEFAULT_DISABLED_KEY : options.disabledKey;

  const history = new SearchHistory({
    limit: options.historyLimit ?? 50,
    storageKey: options.historyKey === undefined ? 'hyperdict:recent' : options.historyKey,
  });

  const buildTabs = (): PopupTab[] => {
    if (options.dictionaries) return options.dictionaries;
    return engine.getDictionaries().map(({ name, metadata, config }) => ({
      name,
      label: config.label || metadata.bookname || name,
      dir: dirFor(config, defaultDir),
      font: config.font,
      fontUrl: config.fontUrl,
      lang: config.lang,
    }));
  };

  const getInfo = (dictName: string): DictInfo | null => {
    const d = engine.getDictionaries().find((x) => x.name === dictName);
    if (!d) return null;
    return {
      title: d.config.label || d.metadata.bookname || dictName,
      author: d.metadata.author,
      wordcount: d.metadata.wordcount,
      extra: d.metadata.description,
    };
  };

  const persist = (): void => {
    if (typeof localStorage === 'undefined') return;
    try {
      if (cfgKey) {
        localStorage.setItem(cfgKey, JSON.stringify(engine.exportConfig('custom')));
      }
      if (disKey) {
        const disabled = engine.listDictionaries().filter((d) => !d.enabled).map((d) => d.name);
        localStorage.setItem(disKey, JSON.stringify(disabled));
      }
    } catch {
      /* ignore quota/availability errors */
    }
  };

  let managePanel: ManageDictionariesPanel | null = null;
  const manageEnabled = options.manage !== false;

  const popup = new ShakeebDictPopup({
    tabs: buildTabs(),
    placeholder: options.placeholder,
    dir: defaultDir,
    htmlTypes: options.htmlTypes,
    transform: options.transform,
    history,
    getInfo,
    attribution: options.attribution,
    lookup: (word) => engine.lookup(word).dictionaries,
    getDefinition: (dictName, word) => engine.getDefinition(dictName, word),
    onManage: manageEnabled ? () => managePanel?.open() : undefined,
  });

  const refresh = (): void => popup.setTabs(buildTabs());

  if (manageEnabled) {
    managePanel = new ManageDictionariesPanel({
      list: (): ManageRow[] =>
        engine
          .listDictionaries()
          .map((d) => ({ name: d.name, label: d.label, origin: d.origin, enabled: d.enabled })),
      setEnabled: async (name, enabled) => {
        await engine.setEnabled(name, enabled);
        persist();
      },
      remove: async (name) => {
        await engine.purgeDictionary(name);
        persist();
      },
      reset: async () => {
        await engine.resetToDefaults();
        persist();
      },
      add: async (config) => {
        await engine.addDictionary(config);
        persist();
      },
      onChange: refresh,
    });
  }

  const detachTriggers = attachTriggers({
    root: options.root,
    selection: options.selection,
    longPress: options.longPress,
    longPressMs: options.longPressMs,
    ignore: (target) => popup.contains(target) || !!managePanel?.contains(target),
    onLookup: (word) => popup.open(word),
  });

  return {
    popup,
    open: (word) => popup.open(word),
    refresh,
    destroy: () => {
      detachTriggers();
      popup.destroy();
      managePanel?.destroy();
    },
  };
}

export { ShakeebDictPopup } from './popup';
export type { PopupTab, PopupOptions, PopupCallbacks, DictInfo } from './popup';
export { attachTriggers } from './triggers';
export type { TriggerOptions } from './triggers';
export { SearchHistory } from './history';
export type { HistoryOptions } from './history';
export { ManageDictionariesPanel } from './manage';
export type { ManageOptions, ManageRow } from './manage';
export { prettifyPlainText, resolveLinkWord, escapeHtml } from './format';
export type { DefinitionTransform } from './format';
