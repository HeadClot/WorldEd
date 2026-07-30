import { Theme } from '@/theme.js';

/**
 * Displays a visible startup failure message over the editor shell.
 *
 * @param container Root editor container.
 * @param error Failure thrown during editor startup.
 */
export function showErrorEditorStartup(container: HTMLElement, error: unknown): void {
  const overlay = createErrorEditorStartupOverlay(error);
  container.style.position = 'relative';
  container.appendChild(overlay);
}

/**
 * Converts an unknown startup failure into a useful message.
 *
 * @param error Failure thrown during editor startup.
 * @returns Human-readable failure text.
 */
export function getErrorEditorStartupMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return 'The editor failed before the renderer could start.';
}

/**
 * Builds the startup failure overlay shown to the user.
 *
 * @param error Failure thrown during editor startup.
 * @returns Configured startup error element.
 */
function createErrorEditorStartupOverlay(error: unknown): HTMLElement {
  const overlay = document.createElement('div');
  overlay.dataset['errorEditorStartup'] = 'true';
  applyErrorEditorStartupOverlayStyles(overlay);
  overlay.appendChild(createErrorEditorStartupTitle());
  overlay.appendChild(createErrorEditorStartupDescription());
  overlay.appendChild(createErrorEditorStartupDetails(error));
  return overlay;
}

/**
 * Applies layout and color styles to the startup failure overlay.
 *
 * @param overlay Startup failure overlay element.
 */
function applyErrorEditorStartupOverlayStyles(overlay: HTMLElement): void {
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.zIndex = '1000';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.gap = '12px';
  overlay.style.padding = '32px';
  overlay.style.background = `#${Theme.background.toString(16).padStart(6, '0')}`;
  overlay.style.color = Theme.buttonTextColor;
  overlay.style.fontFamily = Theme.uiFontFamily;
  overlay.style.textAlign = 'center';
}

/**
 * Creates the startup failure title.
 *
 * @returns Title element.
 */
function createErrorEditorStartupTitle(): HTMLElement {
  const title = document.createElement('h1');
  title.textContent = '3D renderer failed to start';
  title.style.color = `#${Theme.selectionColor.toString(16).padStart(6, '0')}`;
  title.style.fontSize = '20px';
  return title;
}

/**
 * Creates the desktop troubleshooting description.
 *
 * @returns Description element.
 */
function createErrorEditorStartupDescription(): HTMLElement {
  const description = document.createElement('p');
  description.textContent =
    'The editor shell loaded, but the 3D renderer could not initialize. In the desktop build, check WebGL2, WebView2 or CEF GPU settings, GPU drivers, or hardware acceleration.';
  description.style.maxWidth = '620px';
  description.style.lineHeight = '1.5';
  return description;
}

/**
 * Creates the technical startup failure details.
 *
 * @param error Failure thrown during editor startup.
 * @returns Details element.
 */
function createErrorEditorStartupDetails(error: unknown): HTMLElement {
  const details = document.createElement('code');
  details.textContent = getErrorEditorStartupMessage(error);
  details.style.maxWidth = '760px';
  details.style.padding = '10px 12px';
  details.style.background = '#111111';
  details.style.border = '1px solid #444444';
  details.style.borderRadius = '4px';
  details.style.whiteSpace = 'pre-wrap';
  details.style.overflowWrap = 'anywhere';
  return details;
}
