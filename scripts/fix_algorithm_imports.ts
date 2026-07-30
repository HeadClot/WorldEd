/**
 * Fixes solid/algorithm imports after folder moves by resolving module
 * basenames.
 *
 * Usage: bun scripts/fix_algorithm_imports.ts.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const workspaceRoot = process.cwd();
const srcRoot = join(workspaceRoot, 'src');
const algoRoot = join(srcRoot, 'solid', 'algorithm');

/**
 * Collects TypeScript files under a directory.
 *
 * @param directory Directory to walk.
 * @returns Absolute file paths.
 */
function collectTsFiles(directory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const algorithmFiles = collectTsFiles(algoRoot);
const moduleByBase = new Map<string, string>();
for (const filePath of algorithmFiles) {
  moduleByBase.set(basename(filePath, '.ts'), filePath);
}

/**
 * Resolves a module basename to its absolute algorithm path.
 *
 * @param base Module basename without extension.
 * @returns Absolute path or null.
 */
function findModule(base: string): string | null {
  return moduleByBase.get(base) ?? null;
}

/**
 * Builds an import specifier for a resolved algorithm module.
 *
 * @param fromFile Importer absolute path.
 * @param targetFile Target absolute path.
 * @returns Import specifier with .js suffix.
 */
function toSpecifier(fromFile: string, targetFile: string): string {
  if (dirname(fromFile) === dirname(targetFile)) {
    return `./${basename(targetFile, '.ts')}.js`;
  }
  const rel = relative(srcRoot, targetFile).replace(/\\/g, '/').replace(/\.ts$/u, '.js');
  return `@/${rel}`;
}

/**
 * Rewrites relative imports in one file using basename lookup when paths break.
 *
 * @param filePath Absolute file path.
 * @returns Number of rewrites.
 */
function rewriteFile(filePath: string): number {
  const original = readFileSync(filePath, 'utf8');
  const pattern = /(from\s+|import\s*\(\s*)(['"])(\.[^'"]+)\2/g;
  let count = 0;
  const next = original.replace(pattern, (full, prefix: string, quote: string, spec: string) => {
    const withoutJs = spec.endsWith('.js') ? spec.slice(0, -3) : spec;
    const base = basename(withoutJs);
    let target = resolve(dirname(filePath), `${withoutJs}.ts`);
    if (!existsSync(target)) {
      const found = findModule(base);
      if (!found) {
        return full;
      }
      target = found;
    } else if (!target.replace(/\\/g, '/').includes('/solid/algorithm/')) {
      return full;
    }
    const newSpec = toSpecifier(filePath, target);
    if (newSpec === spec) {
      return full;
    }
    count += 1;
    return `${prefix}${quote}${newSpec}${quote}`;
  });
  if (count > 0) {
    writeFileSync(filePath, next, 'utf8');
  }
  return count;
}

/**
 * Rewrites @/solid/algorithm/<base>.js paths that no longer sit at the root.
 *
 * @param filePath Absolute file path.
 * @returns Number of rewrites.
 */
function rewriteAtPaths(filePath: string): number {
  const original = readFileSync(filePath, 'utf8');
  let count = 0;
  const next = original.replace(/@\/solid\/algorithm\/([a-z0-9_]+)\.js/g, (full, base: string) => {
    const found = findModule(base);
    if (!found) {
      return full;
    }
    const rel = relative(srcRoot, found).replace(/\\/g, '/').replace(/\.ts$/u, '.js');
    const newSpec = `@/${rel}`;
    if (newSpec === full) {
      return full;
    }
    count += 1;
    return newSpec;
  });
  if (count > 0) {
    writeFileSync(filePath, next, 'utf8');
  }
  return count;
}

/** Entry point. */
function main(): void {
  let relativeRewrites = 0;
  for (const filePath of algorithmFiles) {
    relativeRewrites += rewriteFile(filePath);
  }
  let atRewrites = 0;
  const allFiles = [...collectTsFiles(srcRoot), ...collectTsFiles(join(workspaceRoot, 'tests'))];
  for (const filePath of allFiles) {
    atRewrites += rewriteAtPaths(filePath);
  }
  console.log(`relative rewrites: ${relativeRewrites}`);
  console.log(`@/ path rewrites: ${atRewrites}`);
}

main();
