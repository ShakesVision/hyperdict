/**
 * Tests for the Chrome extension's shared settings logic and manifest validity,
 * so we don't ship a broken extension.
 * Authored by Shakeeb Ahmad
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// settings.js is a UMD classic script (the extension loads it via <script>);
// execute it as CJS here to grab its exports without ESM/CJS resolution issues.
function loadSettings(): any {
  const code = readFileSync(new URL('../extension/settings.js', import.meta.url), 'utf8');
  const mod = { exports: {} as any };
  // eslint-disable-next-line no-new-func
  new Function('module', 'exports', 'self', code)(mod, mod.exports, undefined);
  return mod.exports;
}
const S = loadSettings();

describe('extension settings', () => {
  it('ships sane defaults', () => {
    expect(S.DEFAULTS.enabled).toBe(true);
    expect(S.DEFAULTS.dictionaries.length).toBe(3);
    expect(S.DEFAULTS.longPress).toBe(false);
  });

  it('withDefaults merges, defaults dicts, and filters invalid entries', () => {
    expect(S.withDefaults({}).dictionaries.length).toBe(3);
    const s = S.withDefaults({ placeholder: 'x', dictionaries: [{ name: 'A', path: '/a/' }, { bad: 1 }] });
    expect(s.placeholder).toBe('x');
    expect(s.dictionaries.length).toBe(1);
    expect(s.dictionaries[0].enabled).toBe(true);
    expect(Array.isArray(s.disabledSites)).toBe(true);
  });

  it('isEnabledOnHost respects the master switch and disabled sites', () => {
    expect(S.isEnabledOnHost({ enabled: true, disabledSites: [] }, 'x.com')).toBe(true);
    expect(S.isEnabledOnHost({ enabled: true, disabledSites: ['x.com'] }, 'x.com')).toBe(false);
    expect(S.isEnabledOnHost({ enabled: false, disabledSites: [] }, 'x.com')).toBe(false);
  });

  it('buildConfigs skips disabled dicts and maps each source kind', () => {
    const cfgs = S.buildConfigs({
      dictionaries: [
        { name: 'P', path: '/p/', enabled: true },
        { name: 'Z', archive: '/z.zip', enabled: true },
        { name: 'F', files: { ifo: 'a', idx: 'b', dict: 'c' }, enabled: true },
        { name: 'off', path: '/o/', enabled: false },
      ],
    });
    expect(cfgs.map((c: any) => c.name)).toEqual(['P', 'Z', 'F']);
    expect(cfgs[0].path).toBe('/p/');
    expect(cfgs[1].archive).toBe('/z.zip');
    expect(cfgs[2].files.dict).toBe('c');
  });

  it('mountOptions disables the in-popup manage panel (options page owns it)', () => {
    expect(S.mountOptions({}).manage).toBe(false);
  });
});

describe('extension manifest', () => {
  const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

  it('is a valid MV3 manifest wired to the right files', () => {
    expect(m.manifest_version).toBe(3);
    expect(typeof m.version).toBe('string');
    expect(m.action.default_popup).toBe('popup.html');
    expect(m.options_page).toBe('options.html');
    expect(m.permissions).toContain('storage');
    expect(m.icons['128']).toBe('icons/icon128.png');
    // Bundles must load before settings.js before content.js (shared globals).
    expect(m.content_scripts[0].js).toEqual([
      'vendor/hyperdict.min.js',
      'vendor/hyperdict-ui.min.js',
      'settings.js',
      'content.js',
    ]);
    expect(m.content_scripts[0].matches).toContain('<all_urls>');
  });
});
