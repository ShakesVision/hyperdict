/**
 * HyperDict UI entry point — reusable popup + triggers.
 * Authored by Shakeeb Ahmad
 *
 * Import as `hyperdict/ui` (ESM) or use the `HyperDictUI` global from the IIFE
 * bundle. The core engine lives in the separate `hyperdict` entry.
 */

export { mountHyperDictUI } from './ui/index';
export type { MountOptions, MountedUI } from './ui/index';
export { ShakeebDictPopup, attachTriggers } from './ui/index';
export type { PopupTab, PopupOptions, PopupCallbacks, TriggerOptions } from './ui/index';
