/**
 * Represents unavailable canvas rendering in the jsdom test environment.
 *
 * @returns Always null because unit tests do not provide a rendering context.
 */
function getUnavailableCanvasContext(): null {
  return null;
}

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: getUnavailableCanvasContext,
});
