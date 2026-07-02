# HyperDict.js

Ultra-fast StarDict dictionary engine for the browser - GoldenDict-style lookups with zero dependencies for the core library.

## 🚀 Features

- **Pure Frontend**: Runs entirely in the browser, WebView, Angular, Ionic, or static websites
- **Lazy Loading**: Only loads dictionary indices on demand, never loads full dictionaries into memory
- **Ultra-Fast**: Binary search completes in <1ms, total lookup <20ms
- **Memory Efficient**: ~25MB max memory (IDX: ~22MB, Bloom filter: 256KB, Prefix index: 150KB, Block cache: 2MB)
- **Random Access**: Reads only the required dictzip chunk(s) over HTTP Range, raw-inflated with bundled fflate — never decompresses the whole file
- **Synonyms & content types**: Resolves `.syn` synonyms and honors `sametypesequence` (renders HTML vs text correctly)
- **Mobile Optimized**: Runs efficiently on low-end Android devices
- **Multiple Dictionaries**: Multiple dictionaries with lazy parallel loading
- **Reusable UI**: An optional, dependency-free popup (`hyperdict/ui`) with text-selection and long-press triggers

## 📦 Supported Format

- **StarDict format**: `.ifo`, `.idx`, `.dict.dz`, `.syn` (optional)
- **Compression**: dictzip (gzip) with random access block decompression

## 🛠️ Installation

```bash
npm install hyperdict
```

## 📚 Quick Start — core engine

```javascript
import { HyperDict } from 'hyperdict'; // fflate is bundled; no extra setup

const engine = new HyperDict();

// Register dictionaries (path = folder containing <name>.ifo/.idx/.dict.dz[/.syn])
engine.registerDictionary({ name: 'UrduLughat', path: 'https://example.com/dicts/urdu/' });

await engine.init(); // loads .ifo + .idx in parallel; parses dictzip headers

// Which dictionaries contain the word?
engine.lookup('کتاب');
// → { word: 'کتاب', dictionaries: [ { name: 'UrduLughat', found: true } ] }

// Fetch a definition (random-access dictzip read + raw inflate)
const def = await engine.getDefinition('UrduLughat', 'کتاب');
// → { word: 'کتاب', definition: '…', dictName: 'UrduLughat', type: 'h' }

// Or fetch from every dictionary that has it, in parallel:
const all = await engine.define('کتاب'); // DefinitionResult[]
```

## 🧩 Headless — bring your own UI (Ionic / React Native WebView / custom)

The core `hyperdict` package is **DOM-free**. You never need the popup — call the
engine and render the raw results however you like (your Ionic/Android styling,
your own components):

```javascript
import { HyperDict } from 'hyperdict';   // no 'hyperdict/ui' import at all

const engine = new HyperDict({ persist: true, preload: true }); // offline-capable
engine.registerDictionary({ name: 'UrduLughat', path: '…/UrduLughatOffline/' });
await engine.init();

const hits = engine.lookup('کتاب').dictionaries;         // [{ name, found }]
const def  = await engine.getDefinition('UrduLughat', 'کتاب');
//        → { word, definition, type, dictName }  ← raw; you render it
const all  = await engine.define('کتاب');                // from every dictionary
```

### Offline (download once, use forever) — great for Ionic/Android apps

`preload: true` downloads the whole `.dict.dz` (instead of range-reading), and
`persist: true` stores every file in the device's **Cache Storage**. So the
first lookup fetches the dictionary, and after that it works with **no network**:

```javascript
// Whole dictionary cached to the device on first use; offline thereafter.
const engine = new HyperDict({ persist: true, preload: true });
// (Or per dictionary: registerDictionary({ name, path, preload: true }))
```

The `archive` source (`{ name, archive: '…/dict.zip' }`) + `persist` is another
offline path — one download of a single zip, decompressed in memory.

## 🪟 Reusable popup UI

```javascript
import { mountHyperDictUI } from 'hyperdict/ui';

mountHyperDictUI({
  engine,
  dictionaries: [{ name: 'UrduLughat', label: 'Urdu Lughat' }],
  placeholder: 'تلاش کریں',
  dir: 'rtl',
  selection: true, // desktop: select text → 🔍 chip
  longPress: true, // mobile: long-press a word
});
```

Plain `<script>` (Blogger/static sites): load `dist/hyperdict.min.js` (global
`HyperDict`) and `dist/hyperdict-ui.min.js` (global `HyperDictUI`). See `docs/`
(which is also the GitHub Pages site).

The popup includes, out of the box: **autocomplete** (type-ahead suggestions
from the index), **all senses** of a word (duplicate headword entries are
merged, not just the first), a **reverse lookup** toggle (find words whose
*meaning* contains your query), **per-dictionary direction & font** (Urdu → RTL +
Nastaliq), **`bword://` cross-reference links**, **recent-search history** with a
back button, an **ⓘ info panel**, **copy** (this dictionary or all, as **plain
text / Markdown / HTML**), a **resizable** window (drag the top-left grip, up to
near-full-screen) with a single-row scrollable tab bar, crisp **inline SVG
icons**, and a **＋ Manage panel** to add/remove, **enable/disable**, **reorder**
(↑/↓), and **reset** dictionaries — adding one via individual file URLs *or* a
single archive (**.zip / .tar / .tar.gz**). Useful options:

```javascript
mountHyperDictUI({
  engine,
  dir: 'rtl',
  manage: true,                 // ＋ add/remove dictionaries (persisted to localStorage)
  historyLimit: 50,             // recent-search cap
  attribution: true,            // ⓘ shows "Powered by HyperDict · Shakeeb Ahmad"
  // Per-dictionary rendering override (e.g. clean up a messy plain-text dict):
  transform: (result, dictName) =>
    dictName === 'UDB' ? result.definition.replaceAll('======', ' · ') : result.definition,
});
```

### Dictionary sources

A dictionary's files can be provided three ways (see `docs/API.md`):

```javascript
// (A) folder URL — files are <name>.ifo/.idx/.dict.dz(/.syn). Tries .dict.dz then .dict.
engine.registerDictionary({ name: 'MyDict', path: 'https://cdn/dicts/mydict/' });

// (B) explicit file URLs (robust when names differ). .dict.dz OR uncompressed .dict both work.
engine.registerDictionary({
  name: 'MyDict',
  files: { ifo: '…/x.ifo', idx: '…/x.idx', dict: '…/x.dict.dz', syn: '…/x.syn' },
});

// (C) a single .zip archive holding all files (downloaded + unzipped in memory)
engine.registerDictionary({ name: 'MyDict', archive: 'https://cdn/mydict.zip' });
```

- **`.dict.dz` vs `.dict`:** `.dict.dz` is dictzip-compressed for random access (preferred — only needed chunks are fetched). A plain `.dict` is the same bytes uncompressed; HyperDict reads the exact byte range directly (requires Range support).
- **Archive caveat:** a `.zip` is fully downloaded + decompressed into memory (no range reads) — best for small/offline dictionaries; prefer `path`/`files` for large ones.

### Managing dictionaries at runtime

Dictionaries are **default** (registered in code) or **custom** (added at
runtime), each **enabled** or **disabled** — so the UI's toggle/remove/reset is
safe and reversible.

```javascript
await engine.addDictionary({
  name: 'MyDict',
  files: { ifo: '…/MyDict.ifo', idx: '…/MyDict.idx', dict: '…/MyDict.dict.dz' },
  label: 'My Dictionary', lang: 'ur', dir: 'rtl', font: 'Noto Nastaliq Urdu',
});

await engine.setEnabled('MyDict', false);   // hide + free memory (reversible)
await engine.setEnabled('MyDict', true);    // reload
engine.removeDictionary('MyDict');          // drop (keeps cached files)
await engine.purgeDictionary('MyDict');     // hard delete + clear cached files
await engine.resetToDefaults();             // remove custom, re-enable defaults
engine.listDictionaries();                  // {name, origin, enabled, loaded, …}[]

// Persist the user's set across reloads (with hyperdict/ui):
//   DEFAULTS.forEach(d => engine.registerDictionary(d));
//   restoreDictionaryState(engine);   // BEFORE init()
//   await engine.init();
```

### Caching & offline

- **In-session:** decompressed dictzip chunks (LRU) + resolved definitions are cached per dictionary — repeat lookups are network-free.
- **Across reloads:** pass `new HyperDict({ persist: true })` to cache the `.ifo`/`.idx`/`.syn` files in the browser **Cache Storage**, so revisiting a dictionary skips the download. (Requires https or localhost.)

> **Hosting note:** the `.dict.dz`/`.dict` host must serve **byte-exact HTTP
> Range responses without transforming the bytes**, plus **CORS**.
> `raw.githubusercontent.com` works; a plain object store (Cloudflare R2 / S3 /
> Backblaze) works. **Avoid CDNs that re-compress at the edge (e.g. jsDelivr)** —
> they break random-access chunk reads. There is no server "meaning" endpoint;
> HyperDict computes definitions in the browser. (For fully offline use, download
> once with `preload` + `persist`, or bundle an `archive`.)

## 🏗️ Architecture

```
src/
├── core/        # engine.ts (orchestration), types.ts            ← DOM-free
├── dict/        # dictionary.ts — one loaded StarDict dictionary
├── index/       # idx-parser.ts, typed-index.ts (TypedArray index)
├── dictzip/     # header-parser.ts, block-reader.ts, inflate.ts   ← random access
├── algorithms/  # binary-search, prefix-index, bloom-filter, lru-cache
├── io/          # range-fetch.ts (HTTP Range)
└── ui/          # popup.ts, triggers.ts, index.ts                 ← optional UI
```

Two build entries: `src/index.ts` → core, `src/ui.ts` → UI. The core is
framework-agnostic and worker-ready; the UI is a separate bundle.

## ✅ Verify it works

```bash
npm test                                              # unit + dictzip regression
HYPERDICT_LIVE=1 npx vitest run tests/integration.live.test.ts  # real dictionary
npm run build && npx http-server docs                 # open the demo (docs/index.html)
```

## 👤 Author

Shakeeb Ahmad — [shakeeb.in](https://shakeeb.in)

## 📄 License

**Apache-2.0** — free to use, modify and redistribute, **with attribution**
(keep the `LICENSE`/`NOTICE` and the copyright banner in the bundles). See
[`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).

## 📦 Publishing

See [`PUBLISHING.md`](./PUBLISHING.md) for the release checklist (version, build,
`npm publish`, GitHub Pages).
