# HyperDict Demo

This is a complete working demo of the HyperDict dictionary engine.

## Files

- **index.html** - Main interactive demo with popup UI
- **hyperdict.min.js** - Bundled HyperDict library
- **hyperdict.min.js.map** - Source map for debugging

## How to Use

### Local Testing

1. Start a local HTTP server in the demo folder:

   ```bash
   python -m http.server 8000
   # or with Node.js
   npx http-server
   ```

2. Open http://localhost:8000 in your browser

3. Click on any word in the demo content to see the dictionary popup

### Features

✓ **Dictionary Selection** - Three tabs for different dictionaries:

- Urdu Lughat (Urdu ↔ Urdu)
- UDB Lughat Kabeer (Comprehensive Urdu)
- Thesaurus

✓ **Word Lookup** - Click any word to open popup with definitions

✓ **Multiple Dictionary Support** - Browse definitions across different sources

✓ **Black & White Design** - Clean, minimal, distraction-free UI

✓ **Real Remote Dictionaries** - Loads actual StarDict dictionaries from GitHub

## Technical Stack

- **Engine**: HyperDict (src/core/engine.ts)
- **Lookup**: Binary search on .idx files
- **Compression**: fflate for .dict.dz decompression
- **UI**: Vanilla JavaScript popup with tabs
- **Dictionaries**: StarDict format (.ifo, .idx, .dict.dz files)

## How It Works

### Initialization Phase

1. Engine loads dictionary metadata from .ifo files
2. Indexes are parsed from .idx files into memory (~22MB per dict)
3. .dict.dz headers are parsed for random access blocks
4. Bloom filters and prefix indices built for fast lookups

### Lookup Phase

1. User clicks a word in the document
2. Word is extracted from the text node
3. Engine performs binary search on the index (~<1ms)
4. If found, popup appears with tabs for each dictionary
5. User can switch between dictionaries

### Definition Retrieval

1. When user clicks a tab, engine looks up word in that dictionary
2. Index provides offset and length in .dict.dz file
3. BlockReader fetches only the necessary compressed block
4. fflate decompresses the block
5. Definition text is extracted and displayed

## Browser Requirements

- Modern browser with:
  - Fetch API (for HTTP requests)
  - ArrayBuffer and TypedArrays
  - ES6+ JavaScript support
  - Compression support (gzip/deflate via fflate)

## Performance

- **Dictionary Loading**: ~2-3 seconds per dictionary
- **Word Lookup**: <1ms per search
- **Definition Fetch**: 20-50ms (includes network + decompression)
- **Memory Usage**: ~25MB for all 3 dictionaries loaded

## Debugging

Open browser DevTools (F12) and check Console tab for logs:

```
[INIT] ========================================
[INIT] Starting HyperDict initialization...
[LOAD] Loading dictionary: UrduLughat
[LOAD] ✓ .ifo loaded: 43428 words
[LOAD] ✓ .idx loaded: 688.5KB
[LOAD] ✓ DictZip header parsed: 43 blocks of 64KB
[INIT] ✓ Engine initialized with 3 dictionaries
...
[POPUP] === Starting lookup for "علم" in UrduLughat ===
[POPUP] STEP 2: Performing lookup
[POPUP] ✓ Definition loaded successfully
```

## Customization

To use different dictionaries, modify `DICTIONARY_CONFIGS` in index.html:

```javascript
const DICTIONARY_CONFIGS = [
  {
    name: 'MyDict',
    displayName: 'My Dictionary',
    path: 'https://example.com/dicts/mydict/',
  },
  // ... more dictionaries
];
```

The path should point to the folder containing:

- MyDict.ifo
- MyDict.idx
- MyDict.dict.dz
- MyDict.syn (optional)

## Troubleshooting

**"fflate is not defined"**

- Make sure the fflate CDN script loads before hyperdict.min.js
- Check browser console for network errors

**"Dictionary loading hangs"**

- Check if dictionary files are accessible (use browser Network tab)
- Verify CORS headers on remote server
- Try a different dictionary or local files

**"Word not found"**

- Word might not be in that particular dictionary
- Try another dictionary using tabs
- Check for spelling variations

**"Lookup is slow"**

- First lookup caches the dictionary - subsequent lookups are instant
- Network latency affects definition retrieval
- Try a dictionary with cached indices

## License

MIT License - See main project README
