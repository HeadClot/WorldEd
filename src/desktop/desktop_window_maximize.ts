/** Desktop window operations required during startup. */
export type MaximizableDesktopWindow = {
  maximize(): unknown;
};

/** Rectangle describing the usable area of a display. */
export type DesktopWorkArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Creates the initial window frame from the native display work area.
 *
 * @param workArea Usable bounds reported by the desktop host.
 * @returns Initial frame that fills the available desktop.
 */
export function buildDesktopWindowFrame(workArea: DesktopWorkArea): DesktopWorkArea {
  return { ...workArea };
}

/**
 * Presents the desktop editor at the available desktop size.
 *
 * @param desktopWindow Native window hosting the editor.
 */
export function maximizeDesktopWindow(desktopWindow: MaximizableDesktopWindow): void {
  desktopWindow.maximize();
}
