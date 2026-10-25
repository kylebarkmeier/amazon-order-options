#!/usr/bin/env node
/**
 * Builds the Chrome extension, the Firefox extension and the Tampermonkey
 * userscript into dist/.
 *
 *   node scripts/build.mjs            # all targets
 *   node scripts/build.mjs chrome     # one target: chrome | firefox | userscript
 *
 * The version comes from package.json and the Amazon host list from
 * src/core/hosts.js, so neither is repeated in manifest/base.json.
 */
import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AMAZON_MATCH_PATTERNS } from '../src/core/hosts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome', 'firefox', 'userscript'];

for (const target of targets) {
  if (target === 'chrome' || target === 'firefox') await buildExtension(target);
  else if (target === 'userscript') await buildUserscript();
  else throw new Error(`Unknown build target: ${target}`);
}

/**
 * @param {'chrome'|'firefox'} target
 * @returns {Promise<object>} the manifest that will be written
 */
export async function buildManifest(target) {
  const base = JSON.parse(await readFile(path.join(root, 'manifest/base.json'), 'utf8'));
  const extra = JSON.parse(await readFile(path.join(root, `manifest/${target}.json`), 'utf8'));
  const manifest = { ...base, ...extra, version: pkg.version };
  manifest.content_scripts = manifest.content_scripts.map((entry) => ({ ...entry, matches: [...AMAZON_MATCH_PATTERNS] }));
  return manifest;
}

async function buildExtension(target) {
  const out = path.join(dist, target);
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, 'icons'), { recursive: true });

  await build({
    entryPoints: {
      content: path.join(root, 'src/content/index.js'),
      options: path.join(root, 'src/options/options.js'),
      background: path.join(root, 'src/background/background.js'),
    },
    bundle: true,
    format: 'iife',
    target: target === 'firefox' ? ['firefox140'] : ['chrome110'],
    outdir: out,
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    logLevel: 'warning',
  });

  const manifest = await buildManifest(target);
  await writeFile(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  await cp(path.join(root, 'src/options/options.html'), path.join(out, 'options.html'));
  await cp(path.join(root, 'src/icons'), path.join(out, 'icons'), { recursive: true });
  console.log(`built ${target} -> ${path.relative(root, out)}`);
}

async function buildUserscript() {
  const out = path.join(dist, 'userscript');
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const base = JSON.parse(await readFile(path.join(root, 'manifest/base.json'), 'utf8'));
  const matches = AMAZON_MATCH_PATTERNS.map((m) => `// @match        ${m}`).join('\n');
  const header = `// ==UserScript==
// @name         ${base.name}
// @namespace    ${pkg.homepage}
// @version      ${pkg.version}
// @description  ${base.description}
// @author       ${pkg.author}
// @homepageURL  ${pkg.homepage}
// @supportURL   ${pkg.bugs.url}
// @downloadURL  ${pkg.homepage}/releases/latest/download/amazon-order-options.user.js
// @updateURL    ${pkg.homepage}/releases/latest/download/amazon-order-options.user.js
// @license      MIT
${matches}
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @run-at       document-idle
// @noframes
// ==/UserScript==
`;

  await build({
    entryPoints: { 'amazon-order-options.user': path.join(root, 'src/content/index.js') },
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    outdir: out,
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    banner: { js: header },
    logLevel: 'warning',
  });
  console.log(`built userscript -> ${path.relative(root, out)}/amazon-order-options.user.js`);
}
