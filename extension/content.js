/**
 * HyperDict extension — content script
 * Authored by Shakeeb Ahmad
 *
 * Runs in every page's isolated world (after the bundled HyperDict/HyperDictUI
 * and settings.js). Reads settings from chrome.storage.sync, and if enabled for
 * this host, builds the engine and mounts the reusable popup + selection chip.
 * Re-mounts when settings change; the toolbar popup can force-open it anywhere.
 */
(function () {
  const S = self.HyperDictSettings;
  const host = location.hostname;
  let ui = null;
  let mounting = null;

  function getSettings() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(null, (data) => resolve(S.withDefaults(data || {})));
      } catch {
        resolve(S.withDefaults({}));
      }
    });
  }

  function teardown() {
    try {
      ui && ui.destroy();
    } catch {
      /* ignore */
    }
    ui = null;
  }

  async function mount(force) {
    const settings = await getSettings();
    if (!force && !S.isEnabledOnHost(settings, host)) {
      teardown();
      return null;
    }
    teardown();
    const engine = new self.HyperDict.HyperDict({ persist: true });
    for (const cfg of S.buildConfigs(settings)) engine.registerDictionary(cfg);
    try {
      await engine.init();
    } catch (e) {
      console.warn('[HyperDict] failed to initialize dictionaries:', e);
      return null;
    }
    ui = self.HyperDictUI.mountHyperDictUI({ engine, ...S.mountOptions(settings) });
    return ui;
  }

  function ensureMounted(force) {
    if (ui) return Promise.resolve(ui);
    if (!mounting) mounting = mount(force).finally(() => (mounting = null));
    return mounting;
  }

  // Toolbar-popup commands.
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'open') {
        ensureMounted(true).then((u) => u && u.open(msg.word || ''));
      } else if (msg && msg.type === 'remount') {
        mount(false);
      }
      sendResponse && sendResponse({ ok: true });
      return true;
    });
  } catch {
    /* not in an extension context (e.g. tests) */
  }

  // Live-apply settings changes without a page reload.
  try {
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === 'sync') mount(false);
    });
  } catch {
    /* ignore */
  }

  mount(false);
})();
