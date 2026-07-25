import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ORIGINAL_RUN_NUMBER = process.env.GITHUB_RUN_NUMBER;

afterEach(() => {
  if (ORIGINAL_RUN_NUMBER === undefined) delete process.env.GITHUB_RUN_NUMBER;
  else process.env.GITHUB_RUN_NUMBER = ORIGINAL_RUN_NUMBER;
});

describe('CI release version assignment', () => {
  it('keeps a version helper script that derives minor from GITHUB_RUN_NUMBER', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/ci_release_version.ts'), 'utf8');
    expect(script).toContain('GITHUB_RUN_NUMBER');
    expect(script).toContain('--write');
    expect(script).toContain('package.json');
    expect(script).toContain('.${runNumber}.0');
  });

  it('wires the desktop build, web build, and release jobs to the CI version script', () => {
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('bun scripts/ci_release_version.ts --write');
    expect(workflow).toContain('bun scripts/ci_release_version.ts');
    expect(workflow).toContain('tag_name: v${{ steps.version.outputs.version }}');
    expect(workflow).toContain('AI World Editor v${{ steps.version.outputs.version }}');
    expect(workflow).toContain('bun scripts/package_desktop_release.ts');
    expect(workflow).toContain('bun scripts/compose_release_notes.ts');
    expect(workflow).toContain('body_path: release_body.md');
    expect(workflow).toContain('Assign application version');
  });

  it('uses package.json major with the run number as the minor component', async () => {
    process.env.GITHUB_RUN_NUMBER = '24';
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    };
    const major = packageJson.version.split('.')[0] || '1';
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync('bun', ['scripts/ci_release_version.ts'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, GITHUB_RUN_NUMBER: '24' },
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(`${major}.24.0`);
  });
});
