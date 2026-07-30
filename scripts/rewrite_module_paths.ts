/**
 * After moving modules under src/, rewrites import specifiers by module
 * basename.
 *
 * Resolves any relative or @/ import whose basename matches a unique file under
 * the given roots, and rewrites to @/<path-from-src>.js (or ./ for same-dir).
 *
 * Usage: bun scripts/rewrite_module_paths.ts src/solid/algorithm bun
 * scripts/rewrite_module_paths.ts src/ui.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const workspaceRoot = process.cwd();
const srcRoot = join(workspaceRoot, 'src');
const testsRoot = join(workspaceRoot, 'tests');
const scanRoots = process.argv.slice(2).map((arg) => resolve(workspaceRoot, arg));

if (scanRoots.length === 0) {
  console.error('Usage: bun scripts/rewrite_module_paths.ts <dir-under-src>...');
  process.exit(2);
}

/**
 * Collects .ts files under a directory.
 *
 * @param directory Absolute directory.
 * @returns Absolute file paths.
 */
function collectTsFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  const results: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const moduleByBase = new Map<string, string>();
for (const root of scanRoots) {
  for (const filePath of collectTsFiles(root)) {
    const base = basename(filePath, '.ts');
    if (moduleByBase.has(base)) {
      console.warn(`duplicate basename skipped for rewrite map: ${base}`);
      continue;
    }
    moduleByBase.set(base, filePath);
  }
}

/**
 * Builds an import specifier for a target under src/.
 *
 * @param fromFile Importer path.
 * @param targetFile Target path under src.
 * @returns Specifier string.
 */
function toSpecifier(fromFile: string, targetFile: string): string {
  if (dirname(fromFile) === dirname(targetFile)) {
    return `./${basename(targetFile, '.ts')}.js`;
  }
  const rel = relative(srcRoot, targetFile).replace(/\\/g, '/').replace(/\.ts$/u, '.js');
  return `@/${rel}`;
}

/**
 * Extracts module basename from an import specifier.
 *
 * @param specifier Import path.
 * @returns Basename without .js, or null.
 */
function specifierBase(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('@/')) {
    const withoutJs = specifier.endsWith('.js') ? specifier.slice(0, -3) : specifier;
    return basename(withoutJs);
  }
  return null;
}

/**
 * Rewrites imports in one file when basenames map to known modules.
 *
 * @param filePath Absolute path.
 * @returns Rewrite count.
 */
function rewriteFile(filePath: string): number {
  const original = readFileSync(filePath, 'utf8');
  const pattern = /(from\s+|import\s*\(\s*)(['"])([^'"]+)\2/g;
  let count = 0;
  const next = original.replace(pattern, (full, prefix: string, quote: string, spec: string) => {
    const base = specifierBase(spec);
    if (!base) {
      return full;
    }
    const target = moduleByBase.get(base);
    if (!target) {
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

/** Entry point. */
function main(): void {
  const files = [...collectTsFiles(srcRoot), ...collectTsFiles(testsRoot)];
  let total = 0;
  let changed = 0;
  for (const filePath of files) {
    const n = rewriteFile(filePath);
    if (n > 0) {
      changed += 1;
      total += n;
    }
  }
  console.log(`modules mapped: ${moduleByBase.size}`);
  console.log(`files changed: ${changed}`);
  console.log(`specifiers rewritten: ${total}`);
}

main();
