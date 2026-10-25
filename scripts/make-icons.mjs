#!/usr/bin/env node
/**
 * Generates the extension icons (a price tag on a rounded square) as PNG
 * files without any image library. Run `npm run icons` after changing it.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { crc32 } from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'src/icons');
await mkdir(outDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  await writeFile(path.join(outDir, `icon-${size}.png`), renderIcon(size));
  console.log(`wrote src/icons/icon-${size}.png`);
}

/**
 * @param {number} size
 * @returns {Buffer}
 */
function renderIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const bg = [241, 194, 50];
  const tag = [15, 17, 17];
  const hole = [241, 194, 50];
  const radius = size * 0.22;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      let color = null;
      let alpha = 0;
      if (insideRoundedSquare(cx, cy, size, radius)) {
        color = bg;
        alpha = 255;
        if (insideTag(cx / size, cy / size)) color = tag;
        if (insideCircle(cx / size, cy / size, 0.36, 0.36, 0.06)) color = hole;
      }
      const i = (y * size + x) * 4;
      if (color) {
        px[i] = color[0];
        px[i + 1] = color[1];
        px[i + 2] = color[2];
        px[i + 3] = alpha;
      }
    }
  }
  return encodePng(size, size, px);
}

function insideRoundedSquare(x, y, size, r) {
  const nx = Math.max(r - x, 0, x - (size - r));
  const ny = Math.max(r - y, 0, y - (size - r));
  return nx * nx + ny * ny <= r * r;
}

/** A tag shape: a rotated square body with a pointed end, in unit coordinates. */
function insideTag(u, v) {
  // Rotate 45 degrees around the centre and test a rectangle with a notch.
  const cx = 0.5;
  const cy = 0.5;
  const dx = u - cx;
  const dy = v - cy;
  const rx = (dx + dy) / Math.SQRT2;
  const ry = (dy - dx) / Math.SQRT2;
  return rx >= -0.32 && rx <= 0.2 && Math.abs(ry) <= 0.17 && !(rx < -0.17 && Math.abs(ry) > 0.17 - (-0.17 - rx) * 1.1);
}

function insideCircle(u, v, cx, cy, r) {
  const dx = u - cx;
  const dy = v - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba
 * @returns {Buffer}
 */
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
