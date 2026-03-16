# HyperDict.js

Ultra-fast StarDict dictionary engine for the browser - GoldenDict-style lookups with zero dependencies for the core library.

## 🚀 Features

- **Pure Frontend**: Runs entirely in the browser, WebView, Angular, Ionic, or static websites
- **Lazy Loading**: Only loads dictionary indices on demand, never loads full dictionaries into memory
- **Ultra-Fast**: Binary search completes in <1ms, total lookup <20ms
- **Memory Efficient**: ~25MB max memory (IDX: ~22MB, Bloom filter: 256KB, Prefix index: 150KB, Block cache: 2MB)
- **Random Access**: Reads only required portions of .dict.dz (dictzip) without full decompression
- **Worker Architecture**: Heavy computation runs in WebWorker for non-blocking UI
- **Mobile Optimized**: Runs efficiently on low-end Android devices
- **Multiple Dictionaries**: Support for multiple dictionaries as tabs with lazy loading

## 📦 Supported Format

- **StarDict format**: `.ifo`, `.idx`, `.dict.dz`, `.syn` (optional)
- **Compression**: dictzip (gzip) with random access block decompression

## 🛠️ Installation

```bash
npm install hyperdict
```

## 📚 Quick Start

```javascript
import HyperDict from 'hyperdict';

const engine = new HyperDict();

// Register dictionaries
await engine.registerDictionary({
  name: 'UrduLughat',
  path: 'https://example.com/dicts/urdu/',
});

// Initialize engine
await engine.init();

// Lookup word
const results = engine.lookup('کتاب');
// Returns: { dictionaries: [ {name: "UrduLughat", ...}, ... ] }

// Get definition from specific dictionary
const definition = await engine.getDefinition('UrduLughat', 'کتاب');
// Returns: { word: "کتاب", definition: "..." }
```

## 📋 Project Status

This is a comprehensive dictionary engine implementation. See the main specification in `prompt.md`.

## 🏗️ Architecture

```
src/
├── core/              # Main engine and worker
├── index/             # IDX file parsing
├── dictzip/           # DictZip header and block reading
├── algorithms/        # Binary search, prefix index, bloom filter, LRU cache
├── io/                # HTTP range requests
├── compression/       # fflate library
└── ui/                # Popup UI components
```

## 📖 Documentation

- [API Reference](./docs/API.md)
- [Architecture Guide](./docs/ARCHITECTURE.md)
- [Integration Examples](./docs/INTEGRATION.md)

## 👤 Author

Shakeeb Ahmad

## 📄 License

MIT
