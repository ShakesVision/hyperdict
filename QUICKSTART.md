# QUICKSTART.md - Get Started with HyperDict in 5 minutes

## Installation

```bash
npm install hyperdict
```

## Step 1: Create an HTML File

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Dictionary Demo</title>
    <style>
      body {
        font-family: sans-serif;
        max-width: 600px;
        margin: 50px auto;
      }
      #results {
        margin-top: 20px;
      }
      button {
        padding: 8px 16px;
        margin: 5px;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <h1>Dictionary Lookup</h1>
    <input type="text" id="word" placeholder="Enter a word..." />
    <button onclick="search()">Search</button>
    <div id="results"></div>

    <script type="module">
      import HyperDict from './dist/index.js';

      window.engine = new HyperDict.HyperDict();

      async function initEngine() {
        // Register your dictionary
        await window.engine.registerDictionary({
          name: 'English',
          path: '/dicts/english/',
        });

        // Initialize
        await window.engine.init();
        console.log('✅ Dictionary loaded!');
      }

      window.search = async function () {
        const word = document.getElementById('word').value;
        const results = window.engine.lookup(word);
        const resultsDiv = document.getElementById('results');

        if (results.dictionaries.some((d) => d.found)) {
          let html = '';
          for (const dict of results.dictionaries) {
            if (dict.found) {
              html += `<button onclick="getDefinition('${dict.name}', '${word}')">${dict.name}</button>`;
            }
          }
          resultsDiv.innerHTML = html;
        } else {
          resultsDiv.innerHTML = '<p>❌ Word not found</p>';
        }
      };

      window.getDefinition = async function (dictName, word) {
        try {
          const def = await window.engine.getDefinition(dictName, word);
          const resultsDiv = document.getElementById('results');
          resultsDiv.innerHTML = `
            <h3>${def.word}</h3>
            <p>${def.definition}</p>
            <small>${dictName}</small>
          `;
        } catch (error) {
          console.error('Error fetching definition:', error);
        }
      };

      // Initialize on load
      initEngine().catch(console.error);
    </script>
  </body>
</html>
```

## Step 2: Prepare Dictionary Files

You need three files from a StarDict dictionary:

- `.ifo` - Metadata
- `.idx` - Index (word list + positions)
- `.dict.dz` - Compressed dictionary data
- `.syn` (optional) - Synonyms

Example directory structure:
```
/dicts/
└── english/
    ├── english.ifo
    ├── english.idx
    ├── english.dict.dz
    └── english.syn
```

## Step 3: Run Build

```bash
npm run build
```

## Step 4: Start a Local Server

```bash
# Using Python
python -m http.server 8000

# Or using Node http-server
npx http-server
```

Then open `http://localhost:8000` in your browser!

## Usage in React

```jsx
import { useState, useEffect } from 'react';
import HyperDict from 'hyperdict';

export default function DictionaryApp() {
  const [engine, setEngine] = useState(null);
  const [word, setWord] = useState('');
  const [results, setResults] = useState(null);
  const [definition, setDefinition] = useState(null);

  useEffect(() => {
    async function init() {
      const e = new HyperDict();
      await e.registerDictionary({
        name: 'English',
        path: '/dicts/english/',
      });
      await e.init();
      setEngine(e);
    }
    init();
  }, []);

  const search = () => {
    if (!engine) return;
    const res = engine.lookup(word);
    setResults(res);
  };

  const getDefinition = async (dictName) => {
    if (!engine) return;
    const def = await engine.getDefinition(dictName, word);
    setDefinition(def);
  };

  if (!engine) return <p>Loading...</p>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Dictionary</h1>
      <input
        value={word}
        onChange={(e) => setWord(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && search()}
        placeholder="Enter word..."
      />
      <button onClick={search}>Search</button>

      {results && (
        <div>
          {results.dictionaries.map(
            (dict) =>
              dict.found && (
                <button key={dict.name} onClick={() => getDefinition(dict.name)}>
                  {dict.name}
                </button>
              )
          )}
        </div>
      )}

      {definition && (
        <div style={{ marginTop: '20px' }}>
          <h3>{definition.word}</h3>
          <p>{definition.definition}</p>
        </div>
      )}
    </div>
  );
}
```

## Common Issues

### Q: Dictionary files not loading?

A: Check:
- CORS headers are enabled on your server
- All three files (.ifo, .idx, .dict.dz) exist
- File names match exactly (case-sensitive on Linux)
- `path` ends with `/`

### Q: Lookups are slow?

A: This is usually the network. Check:
- First access fetches over HTTP (5-15ms)
- Subsequent accesses use cache (<1ms)
- Check DevTools Network tab

### Q: Memory usage high?

A: Normal if using large dictionaries. Check:
- Load only dictionaries you need
- Max ~25MB is expected
- Use `engine.getStats()` to monitor

## Next Steps

- Read [API Reference](./docs/API.md) for all methods
- Check [Integration Guide](./docs/INTEGRATION.md) for your framework
- View [Architecture Guide](./docs/ARCHITECTURE.md) for technical details
- Download a [real dictionary](https://github.com/ShakesVision/urdu-archive) for testing

## Performance Expectations

- **First lookup**: 5-20ms (includes network + decompression)
- **Subsequent lookups**: <1ms (cached)
- **Memory**: ~25MB max
- **Mobile**: Runs smoothly on mid-range Android

## License

MIT
