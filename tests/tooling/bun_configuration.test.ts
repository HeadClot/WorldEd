import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface ProjectManifest {
  packageManager?: string;
  scripts?: Record<string, string>;
}

/**
 * Loads the project manifest used to define the package-manager contract.
 *
 * @returns The parsed project manifest.
 */
function loadProjectManifest(): ProjectManifest {
  const projectManifestPath = resolve(process.cwd(), 'package.json');
  const projectManifestContents = readFileSync(projectManifestPath, 'utf8');
  return JSON.parse(projectManifestContents) as ProjectManifest;
}

describe('Bun project configuration', () => {
  it('declares Bun as the package manager and keeps scripts package-manager neutral', () => {
    const projectManifest = loadProjectManifest();
    const projectScripts = Object.values(projectManifest.scripts ?? {});

    expect(projectManifest.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);
    expect(projectScripts.some((script) => /\b(npm|yarn|pnpm)\b/.test(script))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'package-lock.json'))).toBe(false);
  });

  it('declares the local formatting and CI commands', () => {
    const projectManifest = loadProjectManifest();
    const projectScripts = projectManifest.scripts ?? {};

    expect(projectScripts.format).toBe('prettier --write .');
    expect(projectScripts['format:check']).toBe('prettier --check .');
    expect(projectScripts['typecheck:strict']).toBe('tsc --project tsconfig.strict.json --noEmit');
    expect(projectScripts.ci).toContain('bun run format:check');
    expect(projectScripts.ci).toContain('bun run testrun');
    expect(projectScripts.typecheck).toBe('tsc --noEmit');
    expect(projectScripts.ci).toContain('bun run build');
  });
});
