# HyperDict API Reference

HyperDict is a pure-frontend StarDict engine. It reads `.ifo/.idx/.dict.dz` (or
uncompressed `.dict`) `/.syn` files, never loads a whole dictionary into memory
(for the HTTP path), and fetches only the bytes it needs via HTTP Range +
on-demand decompression.

There are **two entry points**:

| Import | What |
|---|---|
| `hyperdict` | Core engine (DOM-free, framework-agnostic). fflate is bundled. |
| `hyperdict/ui` | Optional reusable popup UI (tabs, search, triggers, manage panel). |

```bash
npm install hyperdict
```

```javascript
import { HyperDict } from 'hyperdict';
import { mountHyperDictUI } from 'hyperdict/ui';
```

Plain `<script>` (Blogger/static sites): load `dist/hyperdict.min.js` (global
`HyperDict`) and `dist/hyperdict-ui.min.js` (global `HyperDictUI`).

> **Hosting requirement:** the `.dict.dz` / `.dict` file must be served with
> **HTTP Range** support and permissive **CORS** (GitHub raw and jsDelivr both
> qualify). There is no server "meaning" endpoint — definitions are computed in
> the browser.

---

## `class HyperDict`

```typescript
new HyperDict(options?: HyperDictOptions)
```

`HyperDictOptions`:

| Option | Type | Default | Meaning |
|---|---|---|---|
| `cacheSize` | `number` | `32` | Decompressed dictzip chunks kept per dictionary (~2 MB at 32). |
| `persist` | `boolean` | `false` | Cache `.ifo`/`.idx`/`.syn` fetches in the browser **Cache Storage** across reloads (needs https or localhost). |

### Methods

#### `registerDictionary(config: DictionaryConfig): void`
Register a dictionary. **Synchronous** — no I/O happens until `init()`.

#### `init(): Promise<void>`
Load all registered dictionaries in parallel. Per-dictionary failures are logged
and skipped; it only throws if **every** dictionary fails.

#### `addDictionary(config: DictionaryConfig): Promise<void>`
Register **and** load one dictionary at runtime (after `init()`). Rejects if the
name is taken or loading fails.

#### `removeDictionary(name: string): boolean`
Remove a dictionary. Returns whether it existed.

#### `lookup(word: string): LookupResult`
Which loaded dictionaries contain `word` (matches headword, ASCII
case-insensitively, or a `.syn` synonym). Fast and synchronous.

```typescript
engine.lookup('کتاب');
// → { word: 'کتاب', dictionaries: [ { name: 'UrduLughat', found: true }, … ] }
```

#### `getDefinition(dictName: string, word: string): Promise<DefinitionResult | null>`
Fetch + decode a definition from one dictionary. `null` if the word is absent.
Results are cached per dictionary (repeat calls are network-free).

#### `define(word: string): Promise<DefinitionResult[]>`
Fetch `word` from every dictionary that has it, in parallel (absent ones omitted).

#### `getDictionaries(): Array<{ name, metadata, config }>`
Loaded dictionaries with their parsed `.ifo` metadata and original config.

#### `hasDictionary(name: string): boolean`

#### `getStats(): { initialized, dictionaryCount, totalWords, memoryUsage, workerSupported }`

#### `exportConfig(): DictionaryConfig[]` / `importConfig(configs): Promise<void>`
Serialize the registered configs and restore them later (e.g. from
localStorage). `importConfig` skips names already present.

---

## `DictionaryConfig`

Specify a content source in **one** of three ways (checked in this order:
`archive` → `files` → `path`):

```typescript
interface DictionaryConfig {
  name: string;                 // unique id

  // (A) one .zip holding all files — downloaded + unzipped in memory
  archive?: string;

  // (B) explicit file URLs
  files?: { ifo: string; idx: string; dict: string; syn?: string };

  // (C) folder URL; files assumed to be `<basename>.ext`
  path?: string;
  basename?: string;            // defaults to `name`

  // UI hints (used by hyperdict/ui; ignored by the core)
  label?: string;               // tab label (defaults to name / bookname)
  lang?: string;                // 'ur', 'ar', 'en', … (drives auto RTL)
  dir?: 'rtl' | 'ltr';          // overrides auto-direction
  font?: string;                // CSS font-family for definitions
  fontUrl?: string;             // stylesheet to inject for `font`
}
```

### Content file: `.dict.dz` vs `.dict`
- **`.dict.dz`** — dictzip (gzip with a random-access chunk table). HyperDict
  reads only the chunk(s) it needs and inflates them. Preferred.
- **`.dict`** — the same bytes, uncompressed. HyperDict reads the exact byte
  range directly (no inflate). Requires HTTP Range support.

With `path`, HyperDict tries `<name>.dict.dz` first, then `<name>.dict`. With
`files`, the extension of `files.dict` decides (`.dz` → dictzip, else plain).

### Archive mode caveat
`archive` downloads and decompresses the **entire** dictionary into memory (a zip
can't be range-read from the server). Great for small dictionaries or bundled
offline use; for large ones prefer `path`/`files` so only needed bytes are read.
Requires a `.zip` (fflate `unzipSync`).

---

## `DefinitionResult`

```typescript
interface DefinitionResult {
  word: string;        // the canonical headword found
  definition: string;  // decoded text/HTML
  dictName: string;
  type?: string;       // StarDict content type: 'h'=HTML, 'm'=plain text, 'g'/'x'=markup…
}
```

Use `type` to decide rendering (the UI renders `h/g/x` as HTML and prettifies the
rest).

---

## Caching & offline

- **Chunk cache** — decompressed dictzip chunks (LRU, `cacheSize`).
- **Definition cache** — resolved `word → result` per dictionary (LRU, 300).
- **Cross-reload** — `new HyperDict({ persist: true })` stores `.ifo/.idx/.syn`
  in Cache Storage.

```typescript
import { clearFileCache } from 'hyperdict';
await clearFileCache();     // drop persisted dictionary files
```

---

## UI — `hyperdict/ui`

### `mountHyperDictUI(options: MountOptions): MountedUI`

Wires the popup + triggers over an engine in one call.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `engine` | `HyperDict` | — | Required. |
| `dictionaries` | `PopupTab[]` | derived from engine | Explicit tab overrides. |
| `placeholder` | `string` | `'Search…'` | Search-box placeholder (e.g. `'تلاش کریں'`). |
| `dir` | `'rtl' \| 'ltr'` | `'rtl'` | Fallback direction when a dict doesn't imply one. |
| `htmlTypes` | `string[]` | `['h','g','x']` | Content types rendered as raw HTML. |
| `transform` | `(result, dictName) => string \| HTMLElement` | — | Per-dictionary render override. |
| `historyLimit` | `number` | `50` | Recent-search cap. |
| `historyKey` | `string \| null` | `'hyperdict:recent'` | localStorage key; `null` = in-memory. |
| `attribution` | `boolean \| { text, url? }` | `true` | Credit shown in the ⓘ panel. |
| `manage` | `boolean` | `true` | Show the ＋ Manage-dictionaries panel. |
| `persistConfigKey` | `string \| null` | `'hyperdict:dicts'` | localStorage key for user-added dicts; `null` = off. |
| `root` | `HTMLElement` | `document.body` | Element watched for gestures. |
| `selection` | `boolean` | `true` | Desktop text-selection → 🔍 chip. |
| `longPress` | `boolean` | `true` | Mobile long-press → lookup. |
| `longPressMs` | `number` | `450` | Long-press threshold. |

Returns `MountedUI`: `{ popup, open(word), refresh(), destroy() }`.

```typescript
const ui = mountHyperDictUI({
  engine,
  placeholder: 'تلاش کریں',
  dir: 'rtl',
  manage: true,
  transform: (r, dict) => (dict === 'UDB' ? r.definition.replaceAll('======', ' · ') : r.definition),
});
```

The popup provides: dictionary **tabs** (missing ones dimmed), a **search box**,
**`bword://` and relative link** lookups, a **← back** button, a **🕘 recent**
dropdown, an **ⓘ info/attribution** panel, and a **＋ Manage** panel (add/remove
dictionaries by archive URL or explicit file URLs, persisted to localStorage).

### Other UI exports
- `ShakeebDictPopup` — the popup component (use directly for a custom mount).
- `attachTriggers(options)` — selection + long-press detection; returns `detach()`.
- `SearchHistory` — bounded, localStorage-backed recent list.
- `ManageDictionariesPanel` — the add/remove overlay.
- `prettifyPlainText`, `resolveLinkWord`, `escapeHtml` — pure formatting helpers.

---

## Low-level building blocks (advanced)

Exported from `hyperdict` for custom pipelines:

- `Dictionary` — one loaded dictionary (`Dictionary.load(config, { inflate, cacheSize, persist })`).
- `resolveFiles(config)` — config → concrete file URLs.
- `ByteSource`, `HttpByteSource`, `BufferByteSource` — "read a byte range" abstraction.
- `PlainDictReader` / `ShaekeebBlockReader` — uncompressed vs dictzip content readers (both `ContentReader`).
- `ShaekeebDictZipHeaderParser` — parse the dictzip RA header.
- `rawInflate` — streaming raw-DEFLATE inflate (handles flushed dictzip chunks).
- `ShaekeebIdxParser`, `ShaekeebIfoParser`, `ShaekeebTypedIndexBuilder`, `TypedIndexReader`.
- `ShaekeebBinarySearch`, `ShaekeebPrefixIndex`, `ShaekeebBloomFilter`, `ShaekeebLRUCache`.
- `ShaekeebRangeFetcher` — HTTP Range helper.

---

## Performance & memory targets

| Metric | Target |
|---|---|
| Index (binary) search | < 1 ms |
| Total lookup (warm cache) | < 1 ms |
| Total lookup (cold, network) | ~5–20 ms |
| Memory (1M-word dict) | ~25 MB (index ~22 MB + bloom 256 KB + prefix ~150 KB + chunk cache ~2 MB) |

### Known limitations (v0.x)
- `idxoffsetbits=64` dictionaries are not supported (offsets are stored as
  `Uint32`); the common 32-bit format is.
- ASCII ordering assumes byte/`g_ascii_strcasecmp`-compatible sort; exotic
  collations may need a custom comparator.
- Multi-field `sametypesequence` is decoded best-effort as its first type.
