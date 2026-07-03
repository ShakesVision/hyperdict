/**
 * HyperDict extension — shared settings model
 * Authored by Shakeeb Ahmad
 *
 * Pure, dependency-free logic shared by the content script, the options page and
 * the tests. UMD: exposes `HyperDictSettings` as a global when loaded as a plain
 * script (content/options pages), and `module.exports` under CommonJS (tests).
 */
(function (root) {
  const REPO =
    'https://raw.githubusercontent.com/ShakesVision/urdu-archive/refs/heads/master/raw/DICTIONARIES/Urdu-Urdu/';

  /** Default, sync-stored settings. */
  const DEFAULTS = {
    enabled: true, // master switch
    dir: 'rtl',
    placeholder: 'تلاش کریں',
    chipLabel: '', // '' → default search icon
    attribution: true,
    selection: true, // selection chip
    longPress: false, // opt-in (collides with normal selection)
    disabledSites: [], // hostnames where the extension stays dormant
    dictionaries: [
      { name: 'UrduLughat', label: 'Urdu Lughat', path: REPO + 'UrduLughatOffline/', lang: 'ur', dir: 'rtl', enabled: true },
      { name: 'UDB_Lughat_Kabeer', label: 'UDB Lughat Kabeer', path: REPO + 'UDBLite/', lang: 'ur', dir: 'rtl', enabled: true },
      { name: 'thesaurus', label: 'Thesaurus', path: REPO + 'Thesaurus/', lang: 'ur', dir: 'rtl', enabled: true },
    ],
  };

  /** Merge stored settings over defaults (shallow, with a validated dictionaries array). */
  function withDefaults(stored) {
    const s = stored && typeof stored === 'object' ? stored : {};
    const dicts = Array.isArray(s.dictionaries) && s.dictionaries.length ? s.dictionaries : DEFAULTS.dictionaries;
    return {
      ...DEFAULTS,
      ...s,
      dictionaries: dicts
        .filter((d) => d && d.name && (d.path || d.files || d.archive))
        .map((d) => ({ enabled: true, ...d })),
      disabledSites: Array.isArray(s.disabledSites) ? s.disabledSites : [],
    };
  }

  /** Whether the extension should activate on a given hostname. */
  function isEnabledOnHost(settings, host) {
    return !!settings.enabled && !(settings.disabledSites || []).includes(host);
  }

  /** Build engine-ready DictionaryConfig[] from settings (only enabled dicts). */
  function buildConfigs(settings) {
    return withDefaults(settings)
      .dictionaries.filter((d) => d.enabled !== false)
      .map((d) => {
        const cfg = { name: d.name, label: d.label || d.name, lang: d.lang, dir: d.dir, font: d.font, fontUrl: d.fontUrl };
        if (d.archive) cfg.archive = d.archive;
        else if (d.files) cfg.files = d.files;
        else cfg.path = d.path;
        return cfg;
      });
  }

  /** Options passed to mountHyperDictUI, derived from settings. */
  function mountOptions(settings) {
    const s = withDefaults(settings);
    return {
      dir: s.dir,
      placeholder: s.placeholder,
      chipLabel: s.chipLabel || undefined,
      attribution: s.attribution,
      selection: s.selection,
      longPress: s.longPress,
      manage: false, // the options page owns dictionary management
    };
  }

  const api = { DEFAULTS, withDefaults, isEnabledOnHost, buildConfigs, mountOptions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HyperDictSettings = api;
})(typeof self !== 'undefined' ? self : this);
