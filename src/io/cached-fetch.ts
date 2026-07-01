/**
 * Cached fetch - whole-file fetching backed by the browser Cache Storage
 * Authored by Shakeeb Ahmad
 *
 * The .ifo/.idx/.syn files are fetched whole (unlike .dict.dz, which is read in
 * ranges). When `persist` is on and the Cache Storage API is available, these
 * files are cached across page loads so revisiting a dictionary is near-instant
 * and works offline. Any Cache API hiccup falls back to a plain network fetch.
 */

export interface FetchOptions {
  persist?: boolean;
  cacheName?: string;
}

export const DEFAULT_CACHE_NAME = 'hyperdict-files-v1';

const hasCaches = (): boolean => typeof caches !== 'undefined';

export async function fetchBuffer(url: string, opts: FetchOptions = {}): Promise<ArrayBuffer> {
  if (opts.persist && hasCaches()) {
    try {
      const cache = await caches.open(opts.cacheName ?? DEFAULT_CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) {
        return await hit.arrayBuffer();
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      await cache.put(url, res.clone());
      return await res.arrayBuffer();
    } catch {
      // Fall through to a plain fetch below.
    }
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.arrayBuffer();
}

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const buffer = await fetchBuffer(url, opts);
  return new TextDecoder('utf-8').decode(buffer);
}

/** Delete all cached dictionary files (e.g. to force a refresh). */
export async function clearFileCache(cacheName: string = DEFAULT_CACHE_NAME): Promise<void> {
  if (hasCaches()) {
    await caches.delete(cacheName);
  }
}

/** Delete specific URLs from the file cache (e.g. when purging one dictionary). */
export async function deleteCachedFiles(
  urls: string[],
  cacheName: string = DEFAULT_CACHE_NAME
): Promise<void> {
  if (!hasCaches() || urls.length === 0) return;
  try {
    const cache = await caches.open(cacheName);
    await Promise.all(urls.map((u) => cache.delete(u)));
  } catch {
    /* ignore */
  }
}
