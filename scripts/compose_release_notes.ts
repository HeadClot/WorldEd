/**
 * Builds a human-facing GitHub release body with direct download links.
 *
 * Usage: bun scripts/compose_release_notes.ts --version 1.24.0 --assets
 * release_assets --sha abc123 --out body.md.
 */

import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const version = requireArg(args.version, '--version');
const assetsDir = resolve(process.cwd(), requireArg(args.assets, '--assets'));
const commitSha = requireArg(args.sha, '--sha');
const outputPath = resolve(process.cwd(), requireArg(args.out, '--out'));
const repository = args.repository ?? 'Henry00IS/AiWorldEd';

const fileNames = readdirSync(assetsDir).filter((name) => statSync(join(assetsDir, name)).isFile());
const body = buildReleaseNotesBody(version, commitSha, repository, fileNames);
writeFileSync(outputPath, body, 'utf8');
process.stdout.write(body);

/**
 * Builds the full markdown release notes body.
 *
 * @param releaseVersion Release version string.
 * @param commitSha Source commit SHA.
 * @param repositoryOwnerAndName GitHub repository path.
 * @param assetNames Uploaded asset file names.
 * @returns Markdown release notes.
 */
function buildReleaseNotesBody(
  releaseVersion: string,
  commitSha: string,
  repositoryOwnerAndName: string,
  assetNames: string[],
): string {
  const baseDownloadUrl = `https://github.com/${repositoryOwnerAndName}/releases/download/v${releaseVersion}`;
  const sections = [
    buildPlatformSection('Windows', baseDownloadUrl, assetNames, {
      setup: (name) => /win/i.test(name) && /setup/i.test(name),
      portable: (name) => /^stable-win-/i.test(name) && name.endsWith('.tar.zst'),
    }),
    buildPlatformSection('Linux', baseDownloadUrl, assetNames, {
      setup: (name) => /linux/i.test(name) && /setup/i.test(name),
      portable: (name) => /^stable-linux-/i.test(name) && name.endsWith('.tar.zst'),
    }),
    buildPlatformSection('macOS', baseDownloadUrl, assetNames, {
      setup: (name) => /macos/i.test(name) && /setup/i.test(name),
      portable: (name) => /^stable-macos-/i.test(name) && name.endsWith('.tar.zst'),
    }),
  ].filter((section) => section.length > 0);

  return [
    `Automated desktop build of **AI World Editor v${releaseVersion}** from commit \`${commitSha}\`.`,
    '',
    ...sections,
  ].join('\n');
}

/**
 * Builds one platform download section when matching assets exist.
 *
 * @param title Section heading such as "Windows".
 * @param baseDownloadUrl Release asset download base URL.
 * @param assetNames Uploaded asset file names.
 * @param matchers Setup and portable matchers for the platform.
 * @returns Markdown section lines, or an empty string when nothing matched.
 */
function buildPlatformSection(
  title: string,
  baseDownloadUrl: string,
  assetNames: string[],
  matchers: {
    setup: (name: string) => boolean;
    portable: (name: string) => boolean;
  },
): string {
  const setupName = assetNames.find(matchers.setup);
  const portableName = assetNames.find(matchers.portable);
  if (!setupName && !portableName) return '';
  const lines = [`## ${title}`, ''];
  if (setupName) lines.push(`- [Download Setup](${baseDownloadUrl}/${setupName}) (\`${setupName}\`)`);
  if (portableName) {
    lines.push(`- [Download Portable](${baseDownloadUrl}/${portableName}) (\`${portableName}\`)`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Parses CLI flags used by this script.
 *
 * @param argv Process arguments after the script name.
 * @returns Parsed options.
 */
function parseArgs(argv: string[]): {
  version?: string;
  assets?: string;
  sha?: string;
  out?: string;
  repository?: string;
} {
  const options: {
    version?: string;
    assets?: string;
    sha?: string;
    out?: string;
    repository?: string;
  } = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--version' && value) {
      options.version = value;
      index++;
    } else if (argument === '--assets' && value) {
      options.assets = value;
      index++;
    } else if (argument === '--sha' && value) {
      options.sha = value;
      index++;
    } else if (argument === '--out' && value) {
      options.out = value;
      index++;
    } else if (argument === '--repository' && value) {
      options.repository = value;
      index++;
    }
  }
  return options;
}

/**
 * Returns a required CLI value or throws.
 *
 * @param value Optional parsed value.
 * @param flagName Flag name for the error message.
 * @returns Non-empty value.
 */
function requireArg(value: string | undefined, flagName: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${flagName} is required`);
  }
  return value.trim();
}
