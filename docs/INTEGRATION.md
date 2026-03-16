# HyperDict Integration Guide

This guide shows how to integrate HyperDict into various frameworks and environments.

## Vanilla JavaScript

### HTML Setup

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://unpkg.com/hyperdict@0.1.0/dist/index.js"></script>
  </head>
  <body>
    <input type="text" id="searchBox" placeholder="Enter a word..." />
    <div id="results"></div>

    <script>
      const engine = new HyperDict.HyperDict();

      async function init() {
        await engine.registerDictionary({
          name: 'English',
          path: '/dicts/english/',
        });
        await engine.init();
      }

      function search() {
        const word = document.getElementById('searchBox').value;
        const results = engine.lookup(word);
        displayResults(results);
      }

      function displayResults(results) {
        const div = document.getElementById('results');
        div.innerHTML = '';

        for (const dict of results.dictionaries) {
          if (dict.found) {
            const btn = document.createElement('button');
            btn.textContent = dict.name;
            btn.onclick = () => showDefinition(dict.name, results.word);
            div.appendChild(btn);
          }
        }
      }

      async function showDefinition(dictName, word) {
        const def = await engine.getDefinition(dictName, word);
        alert(`${word}\n\n${def.definition}`);
      }

      init();
      document.getElementById('searchBox').addEventListener('input', search);
    </script>
  </body>
</html>
```

## React

### Installation

```bash
npm install hyperdict
```

### Hook for HyperDict

```typescript
import { useEffect, useState, useRef } from 'react';
import HyperDict from 'hyperdict';

export function useDictionary(dictConfigs) {
  const engineRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      const engine = new HyperDict();

      for (const config of dictConfigs) {
        await engine.registerDictionary(config);
      }

      await engine.init();
      engineRef.current = engine;
      setReady(true);
    }

    init();
  }, [dictConfigs]);

  const lookup = (word) => {
    if (!engineRef.current) return null;
    return engineRef.current.lookup(word);
  };

  const getDefinition = async (dictName, word) => {
    if (!engineRef.current) return null;
    return engineRef.current.getDefinition(dictName, word);
  };

  return { ready, lookup, getDefinition };
}
```

### React Component Example

```typescript
import React, { useState } from 'react';
import { useDictionary } from './useDictionary';

export function DictionaryComponent() {
  const { ready, lookup, getDefinition } = useDictionary([
    { name: 'English', path: '/dicts/english/' },
    { name: 'English-Urdu', path: '/dicts/en-ur/' },
  ]);

  const [word, setWord] = useState('');
  const [results, setResults] = useState(null);
  const [definition, setDefinition] = useState(null);

  const handleSearch = () => {
    if (ready) {
      setResults(lookup(word));
      setDefinition(null);
    }
  };

  const handleSelectDict = async (dictName) => {
    const def = await getDefinition(dictName, word);
    setDefinition(def);
  };

  if (!ready) return <div>Loading dictionaries...</div>;

  return (
    <div>
      <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Enter word..." />
      <button onClick={handleSearch}>Search</button>

      {results && (
        <div>
          {results.dictionaries.map(
            (dict) =>
              dict.found && (
                <button key={dict.name} onClick={() => handleSelectDict(dict.name)}>
                  {dict.name}
                </button>
              )
          )}
        </div>
      )}

      {definition && (
        <div>
          <h3>{definition.word}</h3>
          <p>{definition.definition}</p>
        </div>
      )}
    </div>
  );
}
```

## Angular

### Service

```typescript
import { Injectable } from '@angular/core';
import HyperDict from 'hyperdict';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class DictionaryService {
  private engine: HyperDict = new HyperDict();
  private ready$ = new BehaviorSubject(false);

  constructor() {
    this.initEngine();
  }

  private async initEngine() {
    await this.engine.registerDictionary({
      name: 'English',
      path: '/dicts/english/',
    });

    await this.engine.init();
    this.ready$.next(true);
  }

  isReady() {
    return this.ready$.asObservable();
  }

  lookup(word: string) {
    return this.engine.lookup(word);
  }

  async getDefinition(dictName: string, word: string) {
    return this.engine.getDefinition(dictName, word);
  }
}
```

### Component

```typescript
import { Component } from '@angular/core';
import { DictionaryService } from './dictionary.service';

@Component({
  selector: 'app-dictionary',
  template: `
    <div *ngIf="!ready">Loading...</div>

    <div *ngIf="ready">
      <input [(ngModel)]="searchWord" placeholder="Enter word..." />
      <button (click)="search()">Search</button>

      <div *ngIf="results">
        <button *ngFor="let dict of results.dictionaries" *ngIf="dict.found" (click)="selectDict(dict.name)">
          {{ dict.name }}
        </button>
      </div>

      <div *ngIf="definition">
        <h3>{{ definition.word }}</h3>
        <p>{{ definition.definition }}</p>
      </div>
    </div>
  `,
})
export class DictionaryComponent {
  searchWord = '';
  results: any = null;
  definition: any = null;
  ready = false;

  constructor(private dictService: DictionaryService) {
    this.dictService.isReady().subscribe((ready) => {
      this.ready = ready;
    });
  }

  search() {
    this.results = this.dictService.lookup(this.searchWord);
  }

  async selectDict(dictName: string) {
    this.definition = await this.dictService.getDefinition(dictName, this.searchWord);
  }
}
```

## Vue 3

### Composable

```typescript
import { ref, reactive } from 'vue';
import HyperDict from 'hyperdict';

export function useDictionary(configs) {
  const engine = new HyperDict();
  const ready = ref(false);

  async function init() {
    for (const config of configs) {
      await engine.registerDictionary(config);
    }
    await engine.init();
    ready.value = true;
  }

  function lookup(word) {
    return engine.lookup(word);
  }

  async function getDefinition(dictName, word) {
    return engine.getDefinition(dictName, word);
  }

  init();

  return { ready, lookup, getDefinition };
}
```

### Component

```vue
<template>
  <div v-if="!ready">Loading dictionaries...</div>

  <div v-else>
    <input v-model="searchWord" placeholder="Enter word..." @input="search" />

    <div v-if="results">
      <button v-for="dict in results.dictionaries" :key="dict.name" v-if="dict.found" @click="selectDict(dict.name)">
        {{ dict.name }}
      </button>
    </div>

    <div v-if="definition">
      <h3>{{ definition.word }}</h3>
      <p>{{ definition.definition }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useDictionary } from './useDictionary';

const { ready, lookup, getDefinition } = useDictionary([
  { name: 'English', path: '/dicts/english/' },
]);

const searchWord = ref('');
const results = ref(null);
const definition = ref(null);

function search() {
  results.value = lookup(searchWord.value);
}

async function selectDict(dictName) {
  definition.value = await getDefinition(dictName, searchWord.value);
}
</script>
```

## Ionic (React)

### Integration

```typescript
import { IonApp, IonContent, IonSearchbar, IonButton, IonCard } from '@ionic/react';
import { useDictionary } from './useDictionary';
import { useState } from 'react';

export function DictionaryApp() {
  const { ready, lookup, getDefinition } = useDictionary([
    { name: 'English', path: '/dicts/english/' },
  ]);

  const [word, setWord] = useState('');
  const [results, setResults] = useState(null);
  const [definition, setDefinition] = useState(null);

  const handleSearch = (value) => {
    setWord(value);
    if (ready && value) {
      setResults(lookup(value));
    }
  };

  const handleSelectDict = async (dictName) => {
    const def = await getDefinition(dictName, word);
    setDefinition(def);
  };

  return (
    <IonApp>
      <IonContent>
        <IonSearchbar value={word} onIonChange={(e) => handleSearch(e.detail.value)} />

        {results && (
          <div>
            {results.dictionaries.map(
              (dict) =>
                dict.found && (
                  <IonButton key={dict.name} onClick={() => handleSelectDict(dict.name)}>
                    {dict.name}
                  </IonButton>
                )
            )}
          </div>
        )}

        {definition && (
          <IonCard>
            <h3>{definition.word}</h3>
            <p>{definition.definition}</p>
          </IonCard>
        )}
      </IonContent>
    </IonApp>
  );
}
```

## Svelte

### Store

```typescript
import { writable } from 'svelte/store';
import HyperDict from 'hyperdict';

function createDictionaryStore() {
  const engine = new HyperDict();
  const ready = writable(false);

  async function init() {
    await engine.registerDictionary({
      name: 'English',
      path: '/dicts/english/',
    });
    await engine.init();
    ready.set(true);
  }

  return {
    ready,
    lookup: (word) => engine.lookup(word),
    getDefinition: (dict, word) => engine.getDefinition(dict, word),
    init,
  };
}

export const dictionary = createDictionaryStore();
```

### Component

```svelte
<script>
  import { dictionary } from './store';

  let searchWord = '';
  let results = null;
  let definition = null;

  dictionary.init();

  async function search() {
    results = dictionary.lookup(searchWord);
  }

  async function selectDict(dictName) {
    definition = await dictionary.getDefinition(dictName, searchWord);
  }
</script>

{#if !$dictionary.ready}
  <p>Loading...</p>
{:else}
  <input bind:value={searchWord} placeholder="Enter word..." />
  <button on:click={search}>Search</button>

  {#if results}
    <div>
      {#each results.dictionaries as dict}
        {#if dict.found}
          <button on:click={() => selectDict(dict.name)}>{dict.name}</button>
        {/if}
      {/each}
    </div>
  {/if}

  {#if definition}
    <h3>{definition.word}</h3>
    <p>{definition.definition}</p>
  {/if}
{/if}
```

## Popup/Word Detection

### Desktop (Right-click popup)

```javascript
document.addEventListener('contextmenu', async (e) => {
  const selection = window.getSelection().toString();

  if (selection) {
    e.preventDefault();

    const engine = new HyperDict();
    const results = engine.lookup(selection);

    // Show popup at mouse position
    showPopup(e.clientX, e.clientY, results);
  }
});
```

### Mobile (Long-press popup)

```javascript
let longPressTimer;

document.addEventListener('touchstart', (e) => {
  longPressTimer = setTimeout(() => {
    const selection = window.getSelection().toString();

    if (selection) {
      const touch = e.touches[0];
      showPopup(touch.clientX, touch.clientY, engine.lookup(selection));
    }
  }, 500); // 500ms long press
});

document.addEventListener('touchend', () => {
  clearTimeout(longPressTimer);
});
```

## Service Worker Integration

### sw.js

```javascript
const DICT_CACHE = 'hyperdict-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(DICT_CACHE));
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/dicts/')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) return response;

        return fetch(event.request).then((response) => {
          return caches.open(DICT_CACHE).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
  }
});
```

### Register in app

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

---

## Performance Tips

1. **Lazy Load Dictionaries**: Only register dictionaries user needs
2. **Use Prefix Index**: Reduces search scope significantly
3. **Cache Aggressively**: Use service workers for offline support
4. **Batch Operations**: Load multiple definitions together
5. **Monitor Memory**: Check `engine.getStats()` for memory usage

---

## Troubleshooting

### "Cannot load dictionary"

- Check CORS headers on dictionary server
- Verify .ifo, .idx, .dict.dz files exist at path
- Check file names match exactly

### "Lookup very slow"

- Dictionary index not loaded yet (wait for `init()`)
- Check network requests for slow range fetches
- Verify block cache is working

### "Memory usage too high"

- Reduce block cache size: `new LRUCache(16)`
- Unregister unused dictionaries
- Check for memory leaks in definitions

---

## License

MIT
