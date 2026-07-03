/**
 * Generate the extension PNG icons (16/48/128) — a white magnifier on black,
 * matching the selection chip. Run: `node extension/icons/generate.mjs`.
 * Replace with branded artwork anytime; this just guarantees valid icons ship.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function renderPng(S) {
  const cx = S * 0.42;
  const cy = S * 0.42;
  const R = S * 0.26;
  const T = Math.max(2, S * 0.09);
  const hx1 = cx + R * Math.SQRT1_2;
  const hy1 = cy + R * Math.SQRT1_2;
  const hx2 = S * 0.82;
  const hy2 = S * 0.82;

  // raw scanlines: each row = filter byte 0 + RGBA pixels
  const raw = Buffer.alloc(S * (S * 4 + 1));
  let o = 0;
  for (let y = 0; y < S; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const onRing = d <= R + T / 2 && d >= R - T / 2;
      const onHandle = distToSegment(x + 0.5, y + 0.5, hx1, hy1, hx2, hy2) <= T / 2;
      const white = onRing || onHandle;
      raw[o++] = white ? 255 : 0;
      raw[o++] = white ? 255 : 0;
      raw[o++] = white ? 255 : 0;
      raw[o++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 48, 128]) {
  writeFileSync(join(DIR, `icon${size}.png`), renderPng(size));
  console.log(`wrote icon${size}.png`);
}
