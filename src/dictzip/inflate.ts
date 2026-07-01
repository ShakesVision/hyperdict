/**
 * Raw DEFLATE inflate for dictzip chunks
 * Authored by Shakeeb Ahmad
 *
 * A dictzip chunk is the slice of a single gzip deflate stream between two
 * Z_FULL_FLUSH points. Crucially, a flushed chunk does NOT end with a final
 * deflate block (BFINAL=0) — it ends on a byte-aligned empty stored block from
 * the flush. fflate's one-shot `inflateSync` treats that as a truncated stream
 * and throws "unexpected EOF".
 *
 * The streaming `Inflate` decoder has no such requirement: pushing the chunk
 * with `final=false` decodes every complete block and emits all output (the
 * empty flush block carries no data), which is exactly the whole chunk. This is
 * the difference that makes dictzip random access actually work.
 */

import { Inflate } from 'fflate';

export function rawInflate(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;

  const inflater = new Inflate((chunk) => {
    parts.push(chunk);
    total += chunk.length;
  });
  // final=false: a flushed dictzip chunk has no BFINAL marker. The last chunk
  // of the file does end with a final block, which the streaming decoder also
  // handles, so a single push covers every case.
  inflater.push(data, false);

  if (parts.length === 1) {
    return parts[0];
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
