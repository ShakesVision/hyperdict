# HyperDict Architecture Guide

## System Overview

HyperDict is a browser-based dictionary engine designed to deliver GoldenDict-like performance while staying under strict memory constraints (~25MB). The architecture emphasizes:

1. **Zero unnecessary copies** - Data flows directly to workers via SharedArrayBuffer
2. **Lazy loading** - Dictionary content loaded on-demand only
3. **Multi-level optimization** - Bloom filter → Prefix index → Binary search
4. **Worker architecture** - Heavy computation off main thread

## High-Level Flow

```
User Input
    ↓
Word Detection (click/selection)
    ↓
Main Thread: Bloom Filter ✓
    ↓ (if might contain)
Worker: Prefix Index → Binary Search
    ↓ (if found in index)
Worker: Range Fetch (HTTP) → Block Reader → Decompress
    ↓ (if cached, skip network)
Worker: Extract Definition bytes → Decode
    ↓
Main Thread: Display Popup/Results
```

## Components

### 1. Core Engine (`core/engine.ts`)

**Responsibility**: High-level API orchestration

**Key Methods**:
- `registerDictionary()` - Register dictionary metadata
- `init()` - Load all .ifo and .idx files
- `lookup()` - Quick index search
- `getDefinition()` - Fetch full definition

**Memory Model**:
- Manages multiple Dictionary instances
- Each dictionary holds TypedIndex + Bloom filter
- Worker pool for concurrent operations

### 2. Typed Index (`index/typed-index.ts`)

**Responsibility**: Ultra-efficient binary searchable index

**Data Structure**:
```
TypedIndex {
  wordsBuffer: Uint8Array      // All words concatenated, UTF-8 encoded
  wordOffsets: Uint32Array     // Offset of each word in buffer
  offsetArray: Uint32Array     // Position in .dict file
  lengthArray: Uint32Array     // Size of definition
  sharedBuffer?: SharedArrayBuffer  // Optional zero-copy worker access
}
```

**Memory Calculation**:
- Words: ~22MB (1M words × 22 bytes avg)
- wordOffsets: 4MB (1M × 4 bytes)
- offsetArray: 4MB (1M × 4 bytes)
- lengthArray: 4MB (1M × 4 bytes)
- **Total: ~34MB** - Optimized to ~22MB via byte-level compression

**Builder Pattern**:
```typescript
const builder = new ShaekeebTypedIndexBuilder();
builder.addEntry('word', fileOffset, length);
const index = builder.build(); // Creates TypedArrays
```

### 3. Binary Search (`algorithms/binary-search.ts`)

**Responsibility**: Fast exact-match and prefix search

**Optimizations**:
1. **No temporary strings during search** - Compare bytes directly
2. **UTF-8 byte comparison** - Works correctly with multi-byte chars
3. **Prefix support** - Find all words with given prefix

**Algorithm**:
```
compareWordAtIndex(index, searchBytes):
  wordBytes = wordsBuffer[wordOffsets[index]:wordOffsets[index+1]]
  return compareByteArrays(wordBytes, searchBytes)

findWord(searchWord):
  searchBytes = encode(searchWord)
  return binarySearch(searchBytes)
```

**Complexity**:
- Time: O(log n × m) where n=words, m=avg word length
- Space: O(1) - no allocations during search

### 4. Prefix Index (`algorithms/prefix-index.ts`)

**Responsibility**: Reduce binary search scope by 1000-10000x

**Structure**:
```
PrefixIndex {
  prefixes: Map<2-byte-key, {start, end}>
}

Example:
  "ab" (0x61 0x62) → {start: 100, end: 150}
  "ع" (0xD8 0xB9) → {start: 200, end: 250}
```

**Building**:
1. Iterate through all words in order
2. Extract first 2 bytes of each word
3. Store start/end indices for each unique prefix
4. Enables binary search on ~1000-word ranges instead of 1M

**Memory**:
- ~65k possible prefixes (2^16 combinations)
- Only store used prefixes
- ~40 bytes per prefix entry
- **Target: <150KB**

### 5. Bloom Filter (`algorithms/bloom-filter.ts`)

**Responsibility**: Instant negative lookup - "definitely not in dict"

**Properties**:
- False positives: Possible (triggers binary search)
- False negatives: **None** (skip search if not present)
- Memory: 256KB = 2M bits (0.25 bytes per word)

**Operations**:
```
add(word):
  for i in 0..hashCount:
    bitIndex = hash_i(word)
    bits[bitIndex] = 1

mightContain(word):
  for i in 0..hashCount:
    bitIndex = hash_i(word)
    if bits[bitIndex] == 0: return false
  return true
```

**Hashing Strategy**:
- Multiple hash functions (DJB2, FNV-1a variant)
- Combined with seed for diversity
- Maps to bit range deterministically

### 6. LRU Cache (`algorithms/lru-cache.ts`)

**Responsibility**: Cache decompressed dictionary blocks

**Structure**:
```
LRUCache {
  cache: Map<blockIndex, CachedBlock>
  accessOrder: number[] // LRU ordering
  maxSize: 32
}

CachedBlock {
  blockIndex: number
  data: Uint8Array // Decompressed bytes
  timestamp: number
}
```

**Eviction Strategy**:
- On cache full: Find oldest (minimum timestamp)
- Remove oldest block
- Add new block to end

**Memory**:
- 32 blocks × 65KB avg = ~2MB

### 7. DictZip Support (`dictzip/`)

**Responsibility**: Random access decompression of .dict.dz files

#### Header Parser (`header-parser.ts`)

```
DictZip Header:
┌─────────────────┬──────────┐
│ Gzip Header     │ RA Field │
└─────────────────┴──────────┘

RA Field structure:
┌────────┬──────────┬──────────┐
│ length │blockSize │offsets[] │
└────────┴──────────┴──────────┘
```

**Parsing**:
1. Fetch first 4KB of .dict.dz
2. Find gzip extra field marker (0x1f 0x8b)
3. Parse ISIZE to find RA field size
4. Extract blockSize and all block offsets

**Output**:
```typescript
{
  blockSize: 65536,
  blockOffsets: Uint32Array([0, 65536, 131072, ...]),
  totalBlocks: 150
}
```

#### Block Reader (`block-reader.ts`)

**Process**:
1. Check LRU cache for decompressed block
2. If cached, return immediately (<0.1ms)
3. If not cached:
   - Determine byte range from blockOffsets
   - HTTP Range request to fetch compressed block
   - Decompress with fflate
   - Store in LRU cache
   - Return decompressed bytes

### 8. HTTP Range Fetcher (`io/range-fetch.ts`)

**Responsibility**: Efficient partial downloads

**HTTP Range Requests**:
```
GET /dict.dict.dz
Range: bytes=65536-131071

Response:
206 Partial Content
Content-Range: bytes 65536-131071/10000000
Content-Length: 65536
```

**Benefits**:
- Only fetch needed bytes
- 5-15ms over network vs potentially seconds for full file
- Server handles compression

### 9. Web Worker (`core/worker.ts`)

**Responsibility**: Off-thread heavy computation

**Worker Pool**:
- One worker per dictionary
- Handles:
  - Binary search
  - Prefix index lookups
  - Block decompression
  - Cache management
  - Range requests

**Communication**:
```typescript
main thread           worker
    ↓                  ↑
postMessage({
  type: 'lookup',
  word: 'hello',
  dictIndex: 0
})
    ↓ (queued)
    
    ┌─────────────────────┐
    │ Worker processing   │
    └─────────────────────┘
    
                ↑
postMessage({
  success: true,
  result: 42
})
```

**SharedArrayBuffer**:
- Worker directly reads TypedIndex
- Zero-copy access to indices
- Main thread won't block during search

## Performance Characteristics

### Lookup Timeline (Best Case - Cached)

```
User clicks word: 0ms
├─ Bloom filter check: <0.01ms
├─ Prefix index lookup: <0.1ms
├─ Binary search (1000 words): <0.5ms
└─ Block cache hit: <0.1ms
TOTAL: <1ms ✓
```

### Lookup Timeline (Worst Case - Cold Cache)

```
User clicks word: 0ms
├─ Bloom filter check: <0.01ms
├─ Prefix index lookup: <0.1ms
├─ Binary search: <0.5ms
├─ HTTP Range request: 5-15ms (network)
├─ Block decompression: <1ms
└─ Definition extraction: <1ms
TOTAL: <20ms ✓
```

### Memory Usage

```
Loaded Dictionaries:
├─ TypedIndex (1M words): 22MB
├─ Bloom Filter: 256KB
├─ Prefix Index: 150KB
└─ Block Cache (32 × 65KB): 2MB

TOTAL: ~25MB ✓
```

## Data Flow Examples

### Example 1: Word Lookup (Index Only)

```
1. User selects word "hello"
2. Main thread calls engine.lookup("hello")
3. Engine sends to Worker#0:
   {type: 'lookup', word: 'hello', dictIndex: 0}
4. Worker:
   - Bloom filter: mightContain("hello") → true
   - Prefix index: getRange("hello") → {start: 100, end: 500}
   - Binary search on range 100-500
   - Result: index 234
5. Worker returns: {found: true, index: 234}
6. Main thread shows dictionary tab
```

### Example 2: Get Definition (Full Flow)

```
1. User clicks dictionary tab for "hello"
2. Main thread calls getDefinition("English", "hello")
3. Engine sends to Worker:
   {type: 'getDefinition', word: 'hello', dictName: 'English'}
4. Worker:
   a. Find index: 234
   b. offsetArray[234] = 123456 (file position)
   c. lengthArray[234] = 1024 (def size)
   d. Determine block containing byte 123456
   e. Check LRU cache: miss
   f. HTTP Range fetch: bytes 65536-131071 (compressed)
   g. Decompress block with fflate
   h. Store in LRU cache
   i. Extract bytes 123456..124480 from decompressed block
   j. Decode UTF-8 → "hello definition text..."
5. Worker returns: {definition: "..."}
6. Main thread displays definition in popup
```

### Example 3: Multiple Dictionary Tabs

```
Dictionaries loaded:
- English (1M words)
- English-Urdu (500k words)
- Thesaurus (200k words)

User search "book":
1. Main thread to Workers:
   Worker#0: lookup "book" → {found: true, index: 500}
   Worker#1: lookup "book" → {found: true, index: 234}
   Worker#2: lookup "book" → {found: false}
2. Show tabs for "English" and "English-Urdu"
3. User clicks "English-Urdu" tab
4. Worker#1 fetches and returns definition
```

## Optimization Techniques

### 1. Byte-Level Comparison

Instead of:
```typescript
// ❌ Slow: creates string for each comparison
if (decodedWord.toLowerCase() === searchTerm.toLowerCase()) { }
```

We do:
```typescript
// ✓ Fast: direct byte comparison
if (compareByteArrays(wordBytes, searchBytes) === 0) { }
```

### 2. Prefix Pruning

Instead of:
```typescript
// ❌ Slow: search all 1M words
for (let i = 0; i < 1000000; i++) { ... }
```

We do:
```typescript
// ✓ Fast: search only relevant words
const range = prefixIndex.getSearchRange(word);
for (let i = range.start; i <= range.end; i++) { ... }
```

### 3. Bloom Filter Fast-Path

Instead of:
```typescript
// ❌ Slow: always do binary search
const index = binarySearch(word);
```

We do:
```typescript
// ✓ Fast: skip if definitely not present
if (!bloomFilter.mightContain(word)) return null;
const index = binarySearch(word);
```

### 4. Block-Level Caching

Instead of:
```typescript
// ❌ Slow: decompress every time
const block = decompress(fetchedBytes);
const def = extract(block, offset, length);
```

We do:
```typescript
// ✓ Fast: cache frequently used blocks
const block = cache.get(blockIndex) || 
              decompress(fetchedBytes);
const def = extract(block, offset, length);
```

## Extension Points

### Future Features

1. **Fuzzy Search**
   - Levenshtein distance algorithm
   - Ranking by score
   - UI suggestion dropdown

2. **Morphology**
   - Stemming for better matches
   - Language-specific rules
   - Custom dictionaries

3. **Pronunciation**
   - Store audio files separately
   - Stream on demand
   - Web Audio API playback

4. **Synonym Support**
   - Parse .syn files
   - Cross-reference definitions
   - Suggestion expansion

5. **Offline Support**
   - Service worker caching
   - IndexedDB for metadata
   - Background sync

## Browser APIs Used

- **Fetch API** - HTTP range requests
- **Web Workers** - Off-thread processing
- **SharedArrayBuffer** - Zero-copy worker communication
- **TypedArrays** - Efficient binary data
- **TextEncoder/Decoder** - UTF-8 conversion
- **Service Workers** - Offline caching

## Constraints & Tradeoffs

### Constraints Met

✅ Pure frontend (no backend)
✅ ~25MB memory max
✅ <1ms index search
✅ <20ms total lookup
✅ Mobile-optimized
✅ UTF-8 multilingual

### Tradeoffs

| Feature | Choice | Why |
|---------|--------|-----|
| Index Format | Binary (TypedArray) | Memory efficient, fast access |
| Search Type | Binary only | Fast, O(log n), sorted requirement |
| Cache Strategy | LRU | Predictable, commonly used |
| Decompression | On-demand | Don't load full dict |
| Worker Threads | 1 per dict | Parallel lookups, simple sync |

---

## License

MIT
