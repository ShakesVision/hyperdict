# HyperDict API Reference

## Overview

HyperDict is an ultra-fast StarDict dictionary engine for the browser. This document describes all public APIs.

## Main Classes

### HyperDict

The main engine class that manages dictionaries and performs lookups.

```typescript
const engine = new HyperDict();
```

#### Methods

##### `registerDictionary(config: DictionaryConfig): Promise<void>`

Register a dictionary with the engine. Dictionary loading is lazy.

```typescript
await engine.registerDictionary({
  name: 'English-Urdu',
  path: 'https://example.com/dicts/en-ur/'
});
```

**Parameters:**
- `config.name` (string): Display name of the dictionary
- `config.path` (string): Base URL to dictionary files (.ifo, .idx, .dict.dz, .syn)

##### `init(): Promise<void>`

Initialize the engine. Must be called after registering dictionaries.

```typescript
await engine.init();
```

##### `lookup(word: string): LookupResult`

Search for a word across all registered dictionaries. Only checks indices, doesn't load definitions yet.

```typescript
const results = engine.lookup('کتاب');
// Returns: {
//   word: 'کتاب',
//   dictionaries: [
//     { name: 'English-Urdu', found: true },
//     { name: 'Thesaurus', found: false }
//   ]
// }
```

**Returns:** `LookupResult` object with search word and which dictionaries contain it.

##### `getDefinition(dictName: string, word: string): Promise<DefinitionResult>`

Fetch the actual definition from a specific dictionary.

```typescript
const def = await engine.getDefinition('English-Urdu', 'کتاب');
// Returns: {
//   word: 'کتاب',
//   definition: '...',
//   dictName: 'English-Urdu'
// }
```

**Parameters:**
- `dictName` (string): Name of the dictionary to search
- `word` (string): Word to look up

**Returns:** `Promise<DefinitionResult>` with the definition.

##### `getStats(): EngineStats`

Get current engine statistics.

```typescript
const stats = engine.getStats();
```

---

## Algorithm Classes

### ShaekeebBinarySearch

High-performance binary search on TypedArray indices.

```typescript
const searcher = new ShaekeebBinarySearch(index);
```

#### Methods

##### `findWord(word: string): number`

Find exact word match.

```typescript
const index = searcher.findWord('hello');
// Returns: 42 (word index), or -1 if not found
```

##### `findPrefix(prefix: string): number[]`

Find all words with given prefix.

```typescript
const indices = searcher.findPrefix('hel');
// Returns: [42, 123, 456] (indices of hello, helpful, helmet, etc.)
```

##### `findWordCaseInsensitive(word: string): number`

Case-insensitive search.

```typescript
const index = searcher.findWordCaseInsensitive('HELLO');
// Finds 'hello' regardless of case
```

##### `getWord(index: number): string`

Get word string at index.

```typescript
const word = searcher.getWord(42); // 'hello'
```

### ShaekeebPrefixIndex

First 2-byte UTF-8 prefix index for reducing search scope.

```typescript
const prefixIndex = new ShaekeebPrefixIndex(typedIndex);
```

#### Methods

##### `getSearchRange(word: string): {start: number, end: number} | null`

Get the index range for a prefix.

```typescript
const range = prefixIndex.getSearchRange('hello');
// Returns: { start: 40, end: 150 }
// Only need to search between indices 40-150
```

##### `getStats(): PrefixIndexStats`

Get prefix index statistics.

```typescript
const stats = prefixIndex.getStats();
// {
//   totalPrefixes: 65536,
//   totalWords: 1000000,
//   averageWordsPerPrefix: 15,
//   memoryUsage: 125000
// }
```

### ShaekeebBloomFilter

Bloom filter for instant negative lookups.

```typescript
const filter = new ShaekeebBloomFilter(100000, 0.01);
```

#### Methods

##### `add(word: string): void`

Add word to bloom filter.

```typescript
filter.add('hello');
```

##### `mightContain(word: string): boolean`

Check if word might be in dictionary.

```typescript
if (!filter.mightContain('xyz')) {
  // Definitely not in dictionary, skip binary search
}
```

##### `toBase64(): string`

Serialize to base64 for storage.

```typescript
const serialized = filter.toBase64();
localStorage.setItem('bloom_filter', serialized);
```

##### `fromBase64(base64: string): ShaekeebBloomFilter`

Deserialize from base64.

```typescript
const filter = ShaekeebBloomFilter.fromBase64(stored);
```

##### `getStats(): BloomFilterStats`

Get filter statistics.

```typescript
const stats = filter.getStats();
// {
//   bitSize: 524288,
//   byteSize: 65536,
//   hashCount: 4,
//   bitsSet: 250000,
//   density: 0.476
// }
```

### ShaekeebLRUCache

Least Recently Used cache for decompressed blocks.

```typescript
const cache = new ShaekeebLRUCache(32);
```

#### Methods

##### `get(blockIndex: number): Uint8Array | null`

Get cached block.

```typescript
const data = cache.get(5);
if (data) {
  // Use cached block
}
```

##### `set(blockIndex: number, data: Uint8Array): void`

Cache a decompressed block.

```typescript
cache.set(5, decompressedBytes);
```

##### `has(blockIndex: number): boolean`

Check if block is cached.

```typescript
if (cache.has(5)) {
  // Block is in cache
}
```

##### `clear(): void`

Clear all cached blocks.

```typescript
cache.clear();
```

##### `getStats(): CacheStats`

Get cache statistics.

```typescript
const stats = cache.getStats();
// {
//   size: 12,
//   maxSize: 32,
//   hitRate: 0.85,
//   memoryUsage: 1048576
// }
```

---

## File Parsers

### ShaekeebIdxParser

Parse StarDict .idx files.

```typescript
const parser = new ShaekeebIdxParser();
```

#### Methods

##### `parseIdx(buffer: ArrayBuffer): ShaekeebTypedIndex`

Parse .idx buffer.

```typescript
const index = parser.parseIdx(idxArrayBuffer);
```

##### `parseIdxFromUrl(url: string): Promise<ShaekeebTypedIndex>`

Fetch and parse .idx from URL.

```typescript
const index = await parser.parseIdxFromUrl(
  'https://example.com/dicts/en/en.idx'
);
```

### ShaekeebIfoParser

Parse StarDict .ifo metadata files.

```typescript
const parser = new ShaekeebIfoParser();
```

#### Methods

##### `parseIfo(buffer: ArrayBuffer): DictionaryMetadata`

Parse .ifo buffer.

```typescript
const metadata = parser.parseIfo(ifoArrayBuffer);
// {
//   version: '2.4.2',
//   bookname: 'English Dictionary',
//   wordcount: 100000,
//   idxfilesize: 2000000,
//   author: 'Dictionary Author',
//   ...
// }
```

##### `parseIfoFromUrl(url: string): Promise<DictionaryMetadata>`

Fetch and parse .ifo from URL.

```typescript
const metadata = await parser.parseIfoFromUrl(
  'https://example.com/dicts/en/en.ifo'
);
```

##### `validate(metadata: DictionaryMetadata): boolean`

Validate metadata.

```typescript
if (parser.validate(metadata)) {
  // Valid dictionary
}
```

---

## DictZip Support

### ShaekeebDictZipHeaderParser

Parse dictzip (.dict.dz) headers for random access.

```typescript
const headerParser = new ShaekeebDictZipHeaderParser();
```

#### Methods

##### `parseHeader(buffer: ArrayBuffer): DictZipHeader`

Parse dictzip header.

```typescript
const header = headerParser.parseHeader(headerBuffer);
// {
//   blockSize: 65536,
//   blockOffsets: Uint32Array([0, 65536, 131072, ...]),
//   totalBlocks: 150
// }
```

##### `parseHeaderFromUrl(url: string): Promise<DictZipHeader>`

Fetch and parse header from URL (first 4KB).

```typescript
const header = await headerParser.parseHeaderFromUrl(
  'https://example.com/dicts/en/en.dict.dz'
);
```

### ShaekeebBlockReader

Read and decompress dictzip blocks.

```typescript
const blockReader = new ShaekeebBlockReader(header);
```

#### Methods

##### `readBlock(blockIndex: number): Promise<Uint8Array>`

Read and decompress a block.

```typescript
const decompressed = await blockReader.readBlock(5);
```

---

## IO

### ShaekeebRangeFetcher

Efficient HTTP range requests for partial downloads.

```typescript
const fetcher = new ShaekeebRangeFetcher(url);
```

#### Methods

##### `fetchRange(start: number, end: number): Promise<Uint8Array>`

Fetch bytes in range.

```typescript
const bytes = await fetcher.fetchRange(1000, 2000);
```

##### `getContentLength(): Promise<number>`

Get total file size.

```typescript
const size = await fetcher.getContentLength();
```

---

## Type Definitions

### DictionaryConfig

```typescript
interface DictionaryConfig {
  name: string;      // Display name
  path: string;      // Base URL to dictionary files
}
```

### LookupResult

```typescript
interface LookupResult {
  word: string;
  dictionaries: Array<{
    name: string;
    found: boolean;
  }>;
}
```

### DefinitionResult

```typescript
interface DefinitionResult {
  word: string;
  definition: string;
  dictName: string;
}
```

### DictionaryMetadata

```typescript
interface DictionaryMetadata {
  version: string;
  bookname: string;
  wordcount: number;
  synwordcount?: number;
  idxfilesize: number;
  dicttype?: string;
  author?: string;
  email?: string;
  website?: string;
  description?: string;
  date?: string;
  sametypesequence?: string;
}
```

### ShaekeebTypedIndex

```typescript
interface ShaekeebTypedIndex {
  wordsBuffer: Uint8Array;           // Raw UTF-8 words
  wordOffsets: Uint32Array;          // Offsets into wordsBuffer
  offsetArray: Uint32Array;          // File offsets in .dict
  lengthArray: Uint32Array;          // Definition lengths
  sharedBuffer?: SharedArrayBuffer;  // Optional: for workers
}
```

---

## Usage Examples

### Basic Lookup

```typescript
import HyperDict from 'hyperdict';

const engine = new HyperDict();

// Register dictionaries
await engine.registerDictionary({
  name: 'English',
  path: 'https://example.com/dicts/en/'
});

// Initialize
await engine.init();

// Lookup word
const results = engine.lookup('hello');
console.log(results); // { word: 'hello', dictionaries: [...] }

// Get definition
if (results.dictionaries[0]?.found) {
  const def = await engine.getDefinition('English', 'hello');
  console.log(def.definition);
}
```

### Multiple Dictionaries

```typescript
const engine = new HyperDict();

await engine.registerDictionary({
  name: 'English-Urdu',
  path: 'https://example.com/dicts/en-ur/'
});

await engine.registerDictionary({
  name: 'English-Hindi',
  path: 'https://example.com/dicts/en-hi/'
});

await engine.init();

// Search shows tabs for all matching dictionaries
const results = engine.lookup('hello');
// results.dictionaries has both English-Urdu and English-Hindi

// Load from specific dictionary
const urduDef = await engine.getDefinition('English-Urdu', 'hello');
const hindiDef = await engine.getDefinition('English-Hindi', 'hello');
```

### Working with Algorithms Directly

```typescript
import {
  ShaekeebBinarySearch,
  ShaekeebBloomFilter,
  ShaekeebPrefixIndex,
  ShaekeebLRUCache,
} from 'hyperdict';

// Use algorithms for custom implementations
const bloomFilter = new ShaekeebBloomFilter(100000, 0.01);
bloomFilter.add('word1');
bloomFilter.add('word2');

if (bloomFilter.mightContain('word1')) {
  // Proceed with binary search
  const searcher = new ShaekeebBinarySearch(index);
  const result = searcher.findWord('word1');
}
```

---

## Performance Benchmarks

- **Binary Search**: &lt;1ms for 1M words
- **Prefix Index Lookup**: &lt;0.1ms
- **Bloom Filter Check**: &lt;0.01ms
- **Block Decompression**: &lt;1ms
- **HTTP Range Request**: 5-15ms (network dependent)
- **Total Lookup**: &lt;20ms (first access)

---

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Full support

## Future APIs (Planned)

- `fuzzySearch(word, threshold)` - Fuzzy matching
- `getSynonyms(word)` - Get synonyms from .syn file
- `getAudio(word)` - Get pronunciation (if available)
- `prefetch(words)` - Preload definitions
- `exportCache()` / `importCache()` - Persist cache

---

## License

MIT
