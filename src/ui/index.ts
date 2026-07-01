/**
 * HyperDict UI - one-call mounting of the popup + triggers over an engine
 * Authored by Shakeeb Ahmad
 *
 * Wires the reusable pieces together:
 *   - builds tab metadata (label / direction / font) from each dictionary's config
 *   - powers the ⓘ info panel from the .ifo metadata
 *   - persists recent searches (localStorage) and end-user-added dictionaries
 *   - opens the Manage panel, backed by engine.addDictionary/removeDictionary
 */

import type { HyperDict } from '../core/engine';
import type { DictionaryConfig } from '../core/types';
import { ShakeebDictPopup, type PopupTab, type DictInfo } from './popup';
import { attachTriggers } from './triggers';
import { SearchHistory } from './history';
import { ManageDictionariesPanel } from './manage';
import type { DefinitionTransform } from './format';

const RTL_LANGS = new Set(['ur', 'ar', 'fa', 'he', 'ps', 'sd', 'ug', 'ckb']);

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
  /** localStorage key to persist end-user-added dictionaries. Default 'hyperdict:dicts'. null = off. */
  persistConfigKey?: string | null;
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

export function mountHyperDictUI(options: MountOptions): MountedUI {
  const { engine } = options;
  const defaultDir = options.dir ?? 'rtl';
  const persistKey =
    options.persistConfigKey === undefined ? 'hyperdict:dicts' : options.persistConfigKey;

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

  const persistConfigs = (): void => {
    if (!persistKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(persistKey, JSON.stringify(engine.exportConfig()));
    } catch {
      /* ignore */
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
      list: () => engine.getDictionaries().map((d) => ({ name: d.name, label: d.config.label || d.name })),
      add: async (config) => {
        await engine.addDictionary(config);
        persistConfigs();
      },
      remove: (name) => {
        engine.removeDictionary(name);
        persistConfigs();
      },
      onChange: refresh,
    });
  }

  // Restore any previously end-user-added dictionaries (additive; skips existing).
  if (persistKey && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) {
        const stored: unknown = JSON.parse(raw);
        if (Array.isArray(stored)) {
          void engine.importConfig(stored as DictionaryConfig[]).then(refresh);
        }
      }
    } catch {
      /* ignore */
    }
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
export type { ManageOptions } from './manage';
export { prettifyPlainText, resolveLinkWord, escapeHtml } from './format';
export type { DefinitionTransform } from './format';
