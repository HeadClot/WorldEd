import { spawnSync } from 'node:child_process';
import { WindowsIconEmbedder } from './windows_icon_embedder.js';

/**
 * Embeds an icon into a Windows executable.
 *
 * @param editorPath Absolute rcedit executable path.
 * @param executablePath Absolute target executable path.
 * @param iconPath Absolute ICO source path.
 */
function runEditor(editorPath: string, executablePath: string, iconPath: string): void {
  const result = spawnSync(editorPath, [executablePath, '--set-icon', iconPath], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`rcedit failed for ${executablePath} with exit code ${result.status}`);
}

const embedder = new WindowsIconEmbedder(process.cwd(), process.env, runEditor);
const embeddedPaths = embedder.embed();
embeddedPaths.forEach((path) => console.log(`Embedded Windows icon into ${path}`));
