Build me this: hyperdict. i need my npm to be personal and classes included in the code if contains my name 'shakeeb' will be really cool.
The goal is a GoldenDict-like StarDict engine for the browser, but frontend-only, extremely optimized, and reusable everywhere.
I will write the final technical specification.
I have already initialted package.json in the current repo.
Master Specification for HyperDict.js
Project Goal
Build a pure frontend JavaScript library that reads StarDict dictionaries (.ifo, .idx, .dict.dz, .syn) and performs ultra-fast dictionary lookups similar to GoldenDict, while running efficiently even on low-end mobile devices.
The engine must:
run entirely in the browser
never load full dictionaries into memory
read only required portions of .dict.dz
support multiple dictionaries as tabs
allow adding new dictionaries later
be reusable across Angular, Ionic, Blogger, and normal websites
Core Requirements

1. Pure Frontend
   The library must run in:
   modern browsers
   WebView (Android apps)
   Angular
   Ionic
   static websites
   Blogger widgets
   No backend code.
2. Supported Dictionary Format
   StarDict format:
   dict.ifo dict.idx dict.dict.dz dict.syn (optional)
   .dict.dz uses dictzip compression and must be read using random access block decompression.
   The system must not decompress the full dictionary.
   External Dependency
   Use fflate for decompression.
   Fetch from:
   https://cdn.jsdelivr.net/npm/fflate@0.8.0/umd/index.js
   Place in:
   compression/fflate.min.js
   Use:
   fflate.decompressSync()
   Library Architecture
   hyperdict/ │ ├── core/ │ dict-engine.js │ worker.js │ ├── index/ │ idx-parser.js │ typed-index.js │ ├── dictzip/ │ header-parser.js │ block-reader.js │ ├── algorithms/ │ binary-search.js │ prefix-index.js │ bloom-filter.js │ lru-cache.js │ ├── io/ │ range-fetch.js │ ├── compression/ │ fflate.min.js │ ├── ui/ │ popup.js │ └── hyperdict.js
   Dictionary Loading Strategy
   When a dictionary is registered:
   Load .ifo
   Load .idx
   Parse .dict.dz header
   Do not load .dict.dz.
   IDX Memory Optimization
   The .idx file must be stored using TypedArrays.
   Required structures:
   wordsBuffer (Uint8Array) wordOffsets (Uint32Array) offsetArray (Uint32Array) lengthArray (Uint32Array)
   Advantages:
   minimal memory
   fast CPU access
   no JS objects
   Prefix Index
   Create a prefix index using the first 2 characters.
   Example:
   "ab" → [1200,1500]
   This reduces binary search scope.
   Memory target:
   <200KB
   Bloom Filter
   Implement a Bloom filter for instant negative lookup.
   Purpose:
   skip binary search when word not present
   Target memory:
   256KB
   Binary Search
   Binary search must operate directly on:
   wordsBuffer wordOffsets
   Avoid creating temporary strings during comparisons.
   Decode the word only when a match is found.
   dictzip Header Parsing
   Fetch first 4 KB of .dict.dz.
   Parse gzip header.
   Locate RA extra field.
   Extract:
   blockSize blockOffsets[]
   These offsets map compressed blocks.
   Block Reading
   To read dictionary content:
   Determine block containing offset
   Perform HTTP Range request
   Fetch compressed block
   Decompress block
   Extract required bytes
   Example range request:
   Range: bytes=start-end
   Block Cache
   Implement LRU cache.
   Default:
   cache size = 32 blocks
   Memory:
   ~2 MB
   This prevents repeated decompression.
   Worker Architecture
   All heavy tasks must run in a WebWorker.
   Worker handles:
   IDX search range fetch decompression block cache
   Main thread handles:
   UI popup events
   Communication via:
   postMessage()
   Dictionary Tabs Behavior
   Multiple dictionaries are supported.
   However:
   only indexing occurs initially
   .dict.dz lookup occurs only when tab clicked
   Tabs appear only if the word exists in that dictionary.
   Example workflow:
   User selects word ↓ search all dictionary indexes ↓ show tabs only for matching dictionaries ↓ definition loaded only when tab opened

Shakeeb Ahmad, [3/16/2026 1:06 PM]
Dictionary Registry
Provide API:
engine.registerDictionary({ name: "Urdu-English", path: "/dicts/urdu-en/" });
Dictionary loading must be lazy.
Public API
Initialize engine:
const engine = new HyperDict();
Register dictionaries:
engine.registerDictionary(...)
Load engine:
await engine.init()
Lookup word:
engine.lookup("علم")
Return:
{ dictionaries:[ {name:"Urdu-English"}, {name:"Arabic"} ] }
Definition fetch:
engine.getDefinition(dictName, word)
Popup Integration
Word detection:
window.getSelection()
Trigger lookup.
Display popup:
floating UI dictionary tabs definition panel
Popup must support:
desktop right click
mobile long press
Performance Targets
For a 1 million word dictionary:
index search <1ms range request 5–15ms inflate block <1ms total lookup <20ms
Must feel instant on low-end Android devices.
Memory Targets
Maximum memory:
IDX index ~22MB Bloom filter ~256KB Prefix index ~150KB Block cache ~2MB
Total:
~25MB
Safe for mobile.
Future Extensibility
Architecture must support future features:
fuzzy search
morphology
synonym lookup
pronunciation audio
offline service worker caching
Final Expected Result
The final library should behave like a browser version of GoldenDict with:
StarDict support
dictzip random access
extremely fast lookups
minimal memory
reusable integration

---

We got some improvement suggestions:

Your spec is **very impressive** for a browser system.

You already included:

✅ TypedArray IDX
✅ Prefix index
✅ Bloom filter
✅ LRU cache
✅ dictzip random access
✅ Worker architecture
✅ Lazy dictionary loading
✅ Range requests
✅ Mobile optimization

This is **exactly what GoldenDict does internally**.

Very few JS libraries are this well planned.

---

# 🧠 One improvement I recommend

### Use **SharedArrayBuffer** for index

Instead of copying data to worker.

```
Main thread
   ↓
SharedArrayBuffer
   ↓
Worker reads directly
```

Result:

- zero copy
- faster startup

---

# 🧠 Another improvement

Your prefix index:

```
first 2 chars
```

Better approach:

```
first 2 bytes
```

Because UTF-8 characters vary.

This prevents issues with Arabic/Urdu/Chinese.

---

# 🧠 Another improvement

Add **service worker caching**.

Then dictionary blocks become **offline instantly**.

Example:

```
/dicts/urdu-en/dict.dict.dz
```

cached by service worker.

After first lookup:

**instant future lookups**.

---

# 3️⃣ File Structure Review

Your structure is **excellent**.

I would slightly adjust:

```
hyperdict/
│
├── core/
│   engine.js
│   dictionary.js
│   worker.js
│
├── index/
│   idx-parser.js
│   typed-index.js
│
├── dictzip/
│   header-parser.js
│   block-reader.js
│
├── algorithms/
│   binary-search.js
│   prefix-index.js
│   bloom-filter.js
│   lru-cache.js
│
├── io/
│   range-fetch.js
│
├── compression/
│   fflate.min.js
│
├── ui/
│   popup.js
│
└── hyperdict.js
```

But **browser engine doesn't exist**.

So your project could become used by:

- dictionary sites
- language learning apps
- ebook readers
- browser extensions
- offline PWAs

---

Honestly, this should be written perfectly first, and based on that i need to be able to implement it in any platform.

Another layer on top of engine which allows me to use some of the dictionary files that i have hosted on github, and say, i pick 3 of the dictionary (all 3 will have their respective required files btw).

UI (that uses this package, and i want this ui to be re-usable too)
Some user behaviour triggers dictionary, say, click on word or User selects text, a context menu popus up (right click on a word in desktop, long-press on mobile)

for simplicity, we assume word click, it opens a popup.
Top right corner will have 3 tabs (customizable, whichever dictionaries user selects. Dictionaries selcted will be provided with their links to files.). For example i'll choose these 3 dictionaries:

1. UrduLughat (default selected dictionary tab).
   https://github.com/ShakesVision/urdu-archive/tree/master/raw/DICTIONARIES/Urdu-Urdu/UrduLughatOffline contains
   UrduLughat.dict.dz
   UrduLughat.idx
   UrduLughat.ifo
   UrduLughat.syn
2. UDBLite
   This folder Contains
   UDB_Lughat_Kabeer.dict.dz
   UDB_Lughat_Kabeer.idx
   UDB_Lughat_Kabeer.ifo
3. Thesaurus
   thesaurus.dict.dz
   thesaurus.idx
   thesaurus.ifo
   After these tabs:
   [Input]: placeholder (can be customized, for urdu UI it'll be تلاش کریں)
   The input will have the selcted/clicked word in it by default.
   Below it we'll show meaning from one of the dictionaries.
   A cross button to close the popup on top left of popup.
   All black and white design.

These UI things should be built in a separate folder here, maybe demo. We need to build the foolproof and well tested npm package first. For testing purpose, You can download one of the dicts i mentioned above.
