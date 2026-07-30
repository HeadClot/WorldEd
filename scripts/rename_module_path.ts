/**
 * Renames module path basenames in import/export specifiers only. Replaces
 * whole basename segments so face_selection_manager is not corrupted when
 * renaming selection_manager.
 *
 * Usage: bun scripts/rename_module_path.ts old_base new_base bun
 * scripts/rename_module_path.ts old_base new_base --dry-run.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const oldBase = process.argv[2];
const newBase = process.argv[3];
const dryRun = process.argv.includes('--dry-run');

if (!oldBase || !newBase) {
  console.error('Usage: bun scripts/rename_module_path.ts old_base new_base [--dry-run]');
  process.exit(2);
}

/**
 * Collects .ts files under a directory.
 *
 * @param directory Directory path.
 * @returns File paths.
 */
function collectTsFiles(directory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'docs' || entry.name === 'reference') {
        continue;
      }
      results.push(...collectTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Rewrites import path basenames in one file.
 *
 * @param filePath Absolute path.
 * @returns Number of replacements.
 */
function rewriteFile(filePath: string): number {
  const original = readFileSync(filePath, 'utf8');
  const pattern = new RegExp(`((?:from|import)\\s*\\(?\\s*['"][^'"]*[/])${oldBase}(\\.js['"])`, 'g');
  const patternDot = new RegExp(`((?:from|import)\\s*\\(?\\s*['"]\\.\\/)${oldBase}(\\.js['"])`, 'g');
  let count = 0;
  let next = original.replace(pattern, (_m, pre: string, post: string) => {
    count += 1;
    return `${pre}${newBase}${post}`;
  });
  next = next.replace(patternDot, (_m, pre: string, post: string) => {
    count += 1;
    return `${pre}${newBase}${post}`;
  });
  if (count > 0 && !dryRun) {
    writeFileSync(filePath, next, 'utf8');
  }
  return count;
}

/** Entry point. */
function main(): void {
  const files = [...collectTsFiles(join(process.cwd(), 'src')), ...collectTsFiles(join(process.cwd(), 'tests'))];
  let total = 0;
  let changed = 0;
  for (const filePath of files) {
    const n = rewriteFile(filePath);
    if (n > 0) {
      changed += 1;
      total += n;
    }
  }
  console.log(dryRun ? '# dry-run' : '# applied');
  console.log(`${oldBase}.js -> ${newBase}.js`);
  console.log(`files changed: ${changed}`);
  console.log(`path rewrites: ${total}`);
}

main();
