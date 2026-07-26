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

/** Optional work to run after the window has been maximized and shown. */
export type AfterDesktopWindowShown = () => void | Promise<void>;

/**
 * Shows a maximized window after its webview can process resize events.
 *
 * @param desktopWindow Native window hosting the editor.
 * @param afterShown Optional callback after maximize/show (for HWND icons).
 */
export function showMaximizedWhenReady(
  desktopWindow: StartupDesktopWindow,
  afterShown?: AfterDesktopWindowShown,
): void {
  desktopWindow.webview.on('dom-ready', () => {
    desktopWindow.maximize();
    desktopWindow.show();
    void afterShown?.();
  });
}
