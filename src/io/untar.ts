/**
 * Minimal tar reader (USTAR)
 * Authored by Shakeeb Ahmad
 *
 * Extracts regular files from an uncompressed tar buffer — enough to read a
 * dictionary bundled as .tar / .tar.gz. tar is a sequence of 512-byte records:
 * a header block (name, octal size, type flag) followed by the file data padded
 * to the next 512-byte boundary. Only regular files are returned.
 */

const dec = new TextDecoder('utf-8');

function readStr(b: Uint8Array, start: number, len: number): string {
  let end = start;
  const max = start + len;
  while (end < max && b[end] !== 0) end++;
  return dec.decode(b.subarray(start, end));
}

export function untar(bytes: Uint8Array): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  let off = 0;

  while (off + 512 <= bytes.length) {
    if (bytes[off] === 0) break; // zero block → end of archive

    const name = readStr(bytes, off, 100);
    const prefix = readStr(bytes, off + 345, 155); // USTAR long-name prefix
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = parseInt(readStr(bytes, off + 124, 12).trim() || '0', 8) || 0;
    const typeflag = bytes[off + 156];

    off += 512;
    // '0' (0x30) or NUL = regular file.
    if (typeflag === 0 || typeflag === 0x30) {
      out[fullName] = bytes.subarray(off, off + size);
    }
    off += Math.ceil(size / 512) * 512;
  }

  return out;
}

/** True if the buffer looks like a tar archive (USTAR magic at offset 257). */
export function isTar(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 262 &&
    bytes[257] === 0x75 && // u
    bytes[258] === 0x73 && // s
    bytes[259] === 0x74 && // t
    bytes[260] === 0x61 && // a
    bytes[261] === 0x72 // r
  );
}
