#!/usr/bin/env node
/**
 * Zips the built extensions for store upload and GitHub releases.
 * Produces dist/amazon-order-options-chrome-<version>.zip and
 * dist/amazon-order-options-firefox-<version>.zip, and copies the userscript
 * next to them with a stable file name.
 */
import { readFile, readdir, stat, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from './zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

for (const target of ['chrome', 'firefox']) {
  const dir = path.join(dist, target);
  const files = await walk(dir);
  const entries = [];
  for (const file of files) {
    entries.push({ name: path.relative(dir, file).split(path.sep).join('/'), data: await readFile(file) });
  }
  const zipPath = path.join(dist, `amazon-order-options-${target}-${pkg.version}.zip`);
  await writeFile(zipPath, createZip(entries));
  console.log(`packaged ${path.relative(root, zipPath)} (${entries.length} files)`);
}

await copyFile(
  path.join(dist, 'userscript', 'amazon-order-options.user.js'),
  path.join(dist, 'amazon-order-options.user.js'),
);
console.log('copied dist/amazon-order-options.user.js');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out.sort();
}
