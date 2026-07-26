import { writeWindowsExecutableIcon } from './windows_pe_icon_writer.js';
import { WindowsIconEmbedder } from './windows_icon_embedder.js';

/**
 * Embeds an icon into a Windows executable via the pure-JS PE rewriter.
 *
 * @param _editorPath Unused legacy rcedit path kept for the embedder callback
 *   shape.
 * @param executablePath Absolute target executable path.
 * @param iconPath Absolute ICO source path.
 */
function runEditor(_editorPath: string, executablePath: string, iconPath: string): void {
  writeWindowsExecutableIcon(executablePath, iconPath);
}

const embedder = new WindowsIconEmbedder(process.cwd(), process.env, runEditor);
const embeddedPaths = embedder.embed();
embeddedPaths.forEach((path) => {
  const label = path.toLowerCase().endsWith('.zip') ? 'Refreshed Windows Setup zip' : 'Embedded Windows icon into';
  console.log(`${label} ${path}`);
});
