/**
 * Rewrites relative imports/exports that resolve under src/ to the @/ alias.
 *
 * Same-directory peers stay as ./file.js. Cross-folder and tests→src imports
 * become @/path/from/src.js. Test-to-test relatives are left unchanged.
 *
 * Usage: bun scripts/codemod_at_imports.ts # write changes bun
 * scripts/codemod_at_imports.ts --dry-run # report only.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const workspaceRoot = process.cwd();
const srcRoot = resolve(workspaceRoot, 'src');
const testsRoot = resolve(workspaceRoot, 'tests');
const dryRun = process.argv.includes('--dry-run');

interface RewriteStats {
  filesScanned: number;
  filesChanged: number;
  specifiersRewritten: number;
  skippedOutsideSrc: number;
  sameDirectoryKept: number;
}

/**
 * Collects TypeScript files under a root directory.
 *
 * @param directory Absolute directory path.
 * @returns Absolute .ts file paths.
 */
function collectTypeScriptFiles(directory: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTypeScriptFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Returns true when candidate is the same path as root or a path inside root.
 *
 * @param candidate Absolute path.
 * @param root Absolute root directory.
 * @returns Whether candidate is under root.
 */
function isInsideRoot(candidate: string, root: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedCandidate = resolve(candidate);
  if (normalizedCandidate === normalizedRoot) {
    return true;
  }
  const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep;
  return normalizedCandidate.startsWith(prefix);
}

/**
 * Normalizes a module specifier filesystem path for comparison.
 *
 * @param absolutePath Absolute path that may include a .js suffix.
 * @returns Absolute path without a trailing .js when a .ts file exists.
 */
function normalizeModuleFilesystemPath(absolutePath: string): string {
  if (absolutePath.endsWith('.js')) {
    const asTs = absolutePath.slice(0, -3) + '.ts';
    if (existsSync(asTs)) {
      return asTs;
    }
    const asDts = absolutePath.slice(0, -3) + '.d.ts';
    if (existsSync(asDts)) {
      return asDts;
    }
    return absolutePath;
  }
  if (!absolutePath.endsWith('.ts') && !absolutePath.endsWith('.json')) {
    const asTs = absolutePath + '.ts';
    if (existsSync(asTs)) {
      return asTs;
    }
  }
  return absolutePath;
}

/**
 * Builds the @/ import specifier for a file under src/.
 *
 * @param absoluteTsPath Absolute path to the target .ts (or .d.ts) file.
 * @param originalSpecifier Original import specifier (for extension style).
 * @returns Specifier such as @/theme.js.
 */
function toAtSpecifier(absoluteTsPath: string, originalSpecifier: string): string {
  let rel = relative(srcRoot, absoluteTsPath).split(sep).join('/');
  if (rel.endsWith('.d.ts')) {
    rel = rel.slice(0, -5) + '.js';
  } else if (rel.endsWith('.ts')) {
    rel = rel.slice(0, -3) + '.js';
  } else if (!rel.endsWith('.js') && originalSpecifier.endsWith('.js')) {
    rel = rel + '.js';
  }
  return `@/${rel}`;
}

/**
 * Builds a same-directory ./ specifier matching repo extension style.
 *
 * @param absoluteTsPath Absolute path to the target file.
 * @param originalSpecifier Original specifier.
 * @returns Specifier such as ./outliner_item.js.
 */
function toSameDirectorySpecifier(absoluteTsPath: string, originalSpecifier: string): string {
  let base = absoluteTsPath.split(sep).pop() ?? absoluteTsPath;
  if (base.endsWith('.d.ts')) {
    base = base.slice(0, -5) + '.js';
  } else if (base.endsWith('.ts')) {
    base = base.slice(0, -3) + '.js';
  } else if (!base.endsWith('.js') && originalSpecifier.endsWith('.js')) {
    base = base + '.js';
  }
  return `./${base}`;
}

/**
 * Rewrites relative module specifiers in one source file.
 *
 * @param filePath Absolute path of the file to process.
 * @param stats Mutable rewrite counters.
 * @returns True when the file content changed.
 */
function rewriteFile(filePath: string, stats: RewriteStats): boolean {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const replacements: Array<{ start: number; end: number; text: string }> = [];
  const fileDir = dirname(filePath);

  /**
   * Considers one module specifier literal for rewriting.
   *
   * @param literal String literal node of the module specifier.
   */
  function considerSpecifier(literal: ts.StringLiteral): void {
    const original = literal.text;
    if (!original.startsWith('.')) {
      return;
    }

    const resolvedFs = normalizeModuleFilesystemPath(resolve(fileDir, original));
    if (!isInsideRoot(resolvedFs, srcRoot)) {
      stats.skippedOutsideSrc += 1;
      return;
    }

    const targetDir = dirname(resolvedFs);
    const importerUnderSrc = isInsideRoot(filePath, srcRoot);
    let nextSpecifier: string;
    if (importerUnderSrc && targetDir === fileDir) {
      nextSpecifier = toSameDirectorySpecifier(resolvedFs, original);
      if (nextSpecifier === original || nextSpecifier === original.replace(/\\/g, '/')) {
        stats.sameDirectoryKept += 1;
        return;
      }
    } else {
      nextSpecifier = toAtSpecifier(resolvedFs, original);
    }

    if (nextSpecifier === original) {
      return;
    }

    replacements.push({
      start: literal.getStart(sourceFile),
      end: literal.getEnd(),
      text: JSON.stringify(nextSpecifier),
    });
    stats.specifiersRewritten += 1;
  }

  /**
   * Visits each node looking for import/export/dynamic-import module
   * specifiers.
   *
   * @param node Current TypeScript AST node.
   */
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      considerSpecifier(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      considerSpecifier(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node) && node.argument && ts.isLiteralTypeNode(node.argument)) {
      const literal = node.argument.literal;
      if (ts.isStringLiteral(literal)) {
        considerSpecifier(literal);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      considerSpecifier(node.arguments[0]!);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      considerSpecifier(node.arguments[0]!);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (replacements.length === 0) {
    return false;
  }

  replacements.sort((a, b) => b.start - a.start);
  let nextText = sourceText;
  for (const replacement of replacements) {
    nextText = nextText.slice(0, replacement.start) + replacement.text + nextText.slice(replacement.end);
  }

  if (!dryRun) {
    writeFileSync(filePath, nextText, 'utf8');
  }
  return true;
}

/** Entry point for the @/ import codemod. */
function main(): void {
  const files = [...collectTypeScriptFiles(srcRoot), ...collectTypeScriptFiles(testsRoot)];
  const stats: RewriteStats = {
    filesScanned: 0,
    filesChanged: 0,
    specifiersRewritten: 0,
    skippedOutsideSrc: 0,
    sameDirectoryKept: 0,
  };

  for (const filePath of files) {
    stats.filesScanned += 1;
    if (rewriteFile(filePath, stats)) {
      stats.filesChanged += 1;
    }
  }

  console.log(dryRun ? '# @/ import codemod (dry-run)' : '# @/ import codemod');
  console.log(`files scanned: ${stats.filesScanned}`);
  console.log(`files changed: ${stats.filesChanged}`);
  console.log(`specifiers rewritten: ${stats.specifiersRewritten}`);
  console.log(`same-directory kept: ${stats.sameDirectoryKept}`);
  console.log(`relative targets outside src skipped: ${stats.skippedOutsideSrc}`);
}

main();
