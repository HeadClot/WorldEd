/** State reported when a WebGL canvas loses or restores its rendering context. */
export type WebGLContextState = 'lost' | 'restored';

/** Details associated with a WebGL context state transition. */
export interface WebGLContextStateChange {
  ownerName: string;
  state: WebGLContextState;
}

/** Details reported when a WebGL context cannot be created. */
export interface WebGLContextCreationError {
  ownerName: string;
  statusMessage: string;
}

/**
 * Callback invoked when a monitored canvas changes WebGL context state.
 *
 * @param change Context owner and new state.
 */
export type WebGLContextStateChangeHandler = (change: WebGLContextStateChange) => void;

/**
 * Installs context-loss and context-restored diagnostics on a canvas.
 *
 * @param canvas Canvas whose WebGL context should be monitored.
 * @param ownerName Human-readable owner name used in diagnostics.
 * @param onStateChange Callback invoked for each state transition.
 */
export function attachWebGLContextDiagnostics(
  canvas: HTMLCanvasElement,
  ownerName: string,
  onStateChange: WebGLContextStateChangeHandler = logWebGLContextStateChange,
): void {
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    onStateChange({ ownerName, state: 'lost' });
  });
  canvas.addEventListener('webglcontextrestored', () => {
    onStateChange({ ownerName, state: 'restored' });
  });
  canvas.addEventListener('webglcontextcreationerror', (event) => {
    logWebGLContextCreationError({
      ownerName,
      statusMessage: getWebGLContextCreationStatus(event),
    });
  });
}

/**
 * Reads the optional browser-provided reason for a context creation failure.
 *
 * @param event WebGL context creation event.
 * @returns Browser status message or a stable fallback.
 */
function getWebGLContextCreationStatus(event: Event): string {
  const contextEvent = event as WebGLContextEvent;
  return contextEvent.statusMessage?.trim() || 'The desktop backend did not provide a status message.';
}

/**
 * Logs a WebGL context creation failure with desktop troubleshooting context.
 *
 * @param error Context owner and browser-provided failure status.
 */
function logWebGLContextCreationError(error: WebGLContextCreationError): void {
  console.error(
    `[AiWorldEd] WebGL context creation failed for ${error.ownerName}: ${error.statusMessage}. Check WebGL2 support, GPU drivers, and desktop hardware acceleration.`,
  );
}

/**
 * Logs a WebGL context state transition with a desktop troubleshooting hint.
 *
 * @param change Context owner and new state.
 */
function logWebGLContextStateChange(change: WebGLContextStateChange): void {
  const message = `[AiWorldEd] WebGL context ${change.state}: ${change.ownerName}`;
  if (change.state === 'lost') {
    console.error(`${message}. Check the desktop WebView or CEF GPU configuration.`);
    return;
  }
  console.info(message);
}
