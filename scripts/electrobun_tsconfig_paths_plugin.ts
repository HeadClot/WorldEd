import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { BunPlugin } from 'bun';

const workspaceRoot = resolve(import.meta.dir, '..');
const srcRoot = join(workspaceRoot, 'src');

/**
 * Resolves an import path that uses the @/ src alias to a filesystem path.
 *
 * @param importPath Specifier starting with @/.
 * @returns Absolute path when a matching file exists, otherwise null.
 */
function resolveAtImport(importPath: string): string | null {
  if (!importPath.startsWith('@/')) {
    return null;
  }
  const relativePath = importPath.slice(2);
  const withoutJs = relativePath.endsWith('.js')
    ? relativePath.slice(0, -3)
    : relativePath.endsWith('.ts')
      ? relativePath.slice(0, -3)
      : relativePath;
  const candidates = [
    join(srcRoot, withoutJs + '.ts'),
    join(srcRoot, withoutJs + '.tsx'),
    join(srcRoot, withoutJs, 'index.ts'),
    join(srcRoot, relativePath),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Bun plugin so Electrobun's Bun.build() resolves tsconfig paths aliases
 * (Bun CLI already does; the programmatic API often does not).
 *
 * @returns Configured Bun plugin.
 */
export function createTsconfigPathsPlugin(): BunPlugin {
  return {
    name: 'electrobun-tsconfig-paths',
    setup(build) {
      build.onResolve({ filter: /^@\// }, (args) => {
        const resolved = resolveAtImport(args.path);
        if (!resolved) {
          return null;
        }
        return { path: resolved };
      });
    },
  };
}

/**
 * Shared Bun.build plugin list for Electrobun bun and view entrypoints.
 *
 * @returns Plugin array for electrobun.config.ts.
 */
export function createElectrobunBuildPlugins(): BunPlugin[] {
  return [createTsconfigPathsPlugin()];
}
