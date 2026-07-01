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
`HyperDict`) and `dist/hyperdict-ui.min.js` (global `HyperDictUI`). See `demo/`.

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
npm run build && npx http-server demo                 # open the demo
```

## 👤 Author

Shakeeb Ahmad

## 📄 License

MIT
