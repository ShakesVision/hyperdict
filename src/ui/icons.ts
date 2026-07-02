/**
 * Inline SVG icons — consistent, crisp, emoji-free
 * Authored by Shakeeb Ahmad
 *
 * A tiny Feather-style icon set (stroked, 24×24 viewBox, `currentColor`) so
 * every control matches regardless of platform emoji fonts. Paths are a few
 * dozen bytes each — negligible bundle cost.
 */

const PATHS: Record<string, string> = {
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h13"/><path d="M17 20l4-4-4-4"/><path d="M21 16H8"/>',
};

export type IconName = keyof typeof PATHS;

/** Return an inline `<svg>` string for the named icon. */
export function icon(name: IconName, size = 16): string {
  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${PATHS[name]}</svg>`
  );
}
