/** Browser surface lifecycle used during desktop startup. */
export type ReadyDesktopWebview = {
  on(name: 'dom-ready', handler: () => void): unknown;
};

/** Native window operations used during desktop startup. */
export type StartupDesktopWindow = {
  webview: ReadyDesktopWebview;
  maximize(): unknown;
  show(): unknown;
};

/**
 * Shows a maximized window after its webview can process resize events.
 *
 * @param desktopWindow Native window hosting the editor.
 */
export function showMaximizedWhenReady(desktopWindow: StartupDesktopWindow): void {
  desktopWindow.webview.on('dom-ready', () => {
    desktopWindow.maximize();
    desktopWindow.show();
  });
}
