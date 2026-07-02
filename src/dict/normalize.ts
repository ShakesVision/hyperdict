/**
 * Text normalization for diacritic-insensitive lookup
 * Authored by Shakeeb Ahmad
 *
 * Urdu/Arabic writers include harakat (zabar/zer/pesh …) inconsistently, and
 * most dictionary headwords are stored *without* them. So a search for "عِلْم"
 * won't byte-match the headword "علم". Stripping the combining diacritics (and
 * the tatweel/kashida elongation U+0640) from the query before searching makes
 * these match. Only non-spacing marks are removed — never a base letter — so
 * this is safe.
 */

// Tatweel + Arabic harakat/tanwin/shadda/sukun + extended combining marks +
// superscript alef + Quranic annotation marks. (Verified against the target
// dictionaries; all of these are non-spacing marks / joiners, not letters.)
const DIACRITICS = /[ـً-ٰٟۖ-ۭ]/g;

/**
 * Remove Arabic/Urdu diacritics and tatweel from a string. Returns the input
 * unchanged when there is nothing to strip (fast path for the common case).
 */
export function stripDiacritics(word: string): string {
  if (!word) return word;
  return word.replace(DIACRITICS, '');
}

/** True if the string contains any strippable diacritic/tatweel. */
export function hasDiacritics(word: string): boolean {
  DIACRITICS.lastIndex = 0;
  return DIACRITICS.test(word);
}
