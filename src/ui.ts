/**
 * HyperDict UI entry point — reusable popup + triggers + management.
 *
 * Import as `hyperdict/ui` (ESM) or use the `HyperDictUI` global from the IIFE
 * bundle. The core engine lives in the separate `hyperdict` entry.
 *
 * @author Shakeeb Ahmad (https://shakeeb.in)
 * @copyright 2026 Shakeeb Ahmad
 * @license Apache-2.0
 */

export { mountHyperDictUI, restoreDictionaryState } from './ui/index';
export type { MountOptions, MountedUI } from './ui/index';
export { ShakeebDictPopup, attachTriggers, SearchHistory, ManageDictionariesPanel } from './ui/index';
export { prettifyPlainText, resolveLinkWord, escapeHtml } from './ui/index';
export { formatOne, formatMany, htmlToPlain, definitionToPlain, copyText, icon } from './ui/index';
export type {
  PopupTab,
  PopupOptions,
  PopupCallbacks,
  DictInfo,
  TriggerOptions,
  HistoryOptions,
  ManageOptions,
  ManageRow,
  DefinitionTransform,
  OutputFormat,
  IconName,
} from './ui/index';
