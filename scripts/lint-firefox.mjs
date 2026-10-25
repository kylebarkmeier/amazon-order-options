#!/usr/bin/env node
/**
 * Runs Mozilla's addons-linter over the built Firefox extension and fails on
 * any error or warning. addons-linter's own exit code only reflects errors,
 * so the JSON report is inspected here.
 *
 *   node scripts/lint-firefox.mjs [dir]   (default: dist/firefox)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(root, process.argv[2] || 'dist/firefox');
if (!existsSync(path.join(dir, 'manifest.json'))) {
  console.error(`No manifest.json in ${dir}. Run "npm run build:firefox" first.`);
  process.exit(2);
}

// Run the linter's JavaScript entry point with this Node directly: no shell,
// so paths with spaces are passed through untouched on every platform.
const require = createRequire(import.meta.url);
const linterBin = path.join(path.dirname(require.resolve('addons-linter/package.json')), 'bin', 'addons-linter');
const result = spawnSync(process.execPath, [linterBin, dir, '--output', 'json'], { encoding: 'utf8' });
if (result.error) {
  console.error(result.error.message);
  process.exit(2);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error(result.stdout || result.stderr);
  process.exit(2);
}

const problems = [...report.errors, ...report.warnings];
for (const item of problems) {
  console.error(`${item._type.toUpperCase()} ${item.code}: ${item.message}${item.file ? ` (${item.file})` : ''}`);
  if (item.description) console.error(`  ${item.description}`);
}
for (const item of report.notices) {
  console.log(`notice ${item.code}: ${item.message}`);
}

const { errors, warnings, notices } = report.summary;
console.log(`addons-linter: ${errors} errors, ${warnings} warnings, ${notices} notices in ${path.relative(root, dir)}`);
process.exit(problems.length ? 1 : 0);
