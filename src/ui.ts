/**
 * HyperDict UI entry point — reusable popup + triggers + management.
 * Authored by Shakeeb Ahmad
 *
 * Import as `hyperdict/ui` (ESM) or use the `HyperDictUI` global from the IIFE
 * bundle. The core engine lives in the separate `hyperdict` entry.
 */

export { mountHyperDictUI } from './ui/index';
export type { MountOptions, MountedUI } from './ui/index';
export { ShakeebDictPopup, attachTriggers, SearchHistory, ManageDictionariesPanel } from './ui/index';
export { prettifyPlainText, resolveLinkWord, escapeHtml } from './ui/index';
export type {
  PopupTab,
  PopupOptions,
  PopupCallbacks,
  DictInfo,
  TriggerOptions,
  HistoryOptions,
  ManageOptions,
  DefinitionTransform,
} from './ui/index';
