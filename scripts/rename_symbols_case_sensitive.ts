/**
 * Case-sensitive symbol renames across src/ and tests/. Never use PowerShell
 * -replace for identifiers (it is case-insensitive).
 *
 * Usage: bun scripts/rename_symbols_case_sensitive.ts OldName NewName bun
 * scripts/rename_symbols_case_sensitive.ts OldName NewName --dry-run.
 *
 * Skips renames inside single-quoted and double-quoted string literals so DOM
 * event names like 'contextmenu' and storage keys stay intact.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const workspaceRoot = process.cwd();
const oldName = process.argv[2];
const newName = process.argv[3];
const dryRun = process.argv.includes('--dry-run');

if (!oldName || !newName) {
  console.error('Usage: bun scripts/rename_symbols_case_sensitive.ts OldName NewName [--dry-run]');
  process.exit(2);
}

if (oldName === newName) {
  console.error('Old and new names must differ.');
  process.exit(2);
}

/**
 * Collects TypeScript files under a root.
 *
 * @param directory Absolute directory.
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
 * Replaces whole-word identifier occurrences outside string literals.
 *
 * @param source File text.
 * @param from Identifier to replace.
 * @param to Replacement identifier.
 * @returns Updated text and replacement count.
 */
function replaceIdentifiersOutsideStrings(source: string, from: string, to: string): { text: string; count: number } {
  let count = 0;
  let output = '';
  let index = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  const isIdentChar = (ch: string | undefined): boolean => !!ch && /[A-Za-z0-9_$]/.test(ch);

  while (index < source.length) {
    const ch = source[index]!;
    const next = source[index + 1];

    if (inLineComment) {
      output += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      index += 1;
      continue;
    }
    if (inBlockComment) {
      output += ch;
      if (ch === '*' && next === '/') {
        output += next;
        index += 2;
        inBlockComment = false;
        continue;
      }
      index += 1;
      continue;
    }
    if (inSingle) {
      output += ch;
      if (ch === '\\' && index + 1 < source.length) {
        output += source[index + 1]!;
        index += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      index += 1;
      continue;
    }
    if (inDouble) {
      output += ch;
      if (ch === '\\' && index + 1 < source.length) {
        output += source[index + 1]!;
        index += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      index += 1;
      continue;
    }
    if (inTemplate) {
      output += ch;
      if (ch === '\\' && index + 1 < source.length) {
        output += source[index + 1]!;
        index += 2;
        continue;
      }
      if (ch === '`') {
        inTemplate = false;
      }
      index += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      output += '//';
      index += 2;
      inLineComment = true;
      continue;
    }
    if (ch === '/' && next === '*') {
      output += '/*';
      index += 2;
      inBlockComment = true;
      continue;
    }
    if (ch === "'") {
      output += ch;
      inSingle = true;
      index += 1;
      continue;
    }
    if (ch === '"') {
      output += ch;
      inDouble = true;
      index += 1;
      continue;
    }
    if (ch === '`') {
      output += ch;
      inTemplate = true;
      index += 1;
      continue;
    }

    if (source.startsWith(from, index)) {
      const before = source[index - 1];
      const after = source[index + from.length];
      if (!isIdentChar(before) && !isIdentChar(after)) {
        output += to;
        index += from.length;
        count += 1;
        continue;
      }
    }

    output += ch;
    index += 1;
  }

  return { text: output, count };
}

/** Entry point. */
function main(): void {
  const files = [...collectTsFiles(join(workspaceRoot, 'src')), ...collectTsFiles(join(workspaceRoot, 'tests'))];
  let filesChanged = 0;
  let total = 0;
  for (const filePath of files) {
    const original = readFileSync(filePath, 'utf8');
    const { text, count } = replaceIdentifiersOutsideStrings(original, oldName, newName);
    if (count === 0) {
      continue;
    }
    filesChanged += 1;
    total += count;
    if (!dryRun) {
      writeFileSync(filePath, text, 'utf8');
    }
  }
  console.log(dryRun ? '# dry-run' : '# applied');
  console.log(`${oldName} -> ${newName}`);
  console.log(`files changed: ${filesChanged}`);
  console.log(`replacements: ${total}`);
}

main();
