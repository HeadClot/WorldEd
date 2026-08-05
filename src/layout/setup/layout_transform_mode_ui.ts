import { TransformMode } from '@/types/transform_mode.js';
import type { ControllerViewportToolChrome } from '@/tools/chrome/controller/controller_viewport_tool_chrome.js';
import type { StatusBar } from '@/ui/status/status_bar.js';

/**
 * Updates tool chrome transform mode highlight and status bar action text.
 *
 * @param toolsPaletteController Viewport tool chrome controller.
 * @param statusBar Status bar for last-action text.
 * @param mode Active transform mode.
 */
export function applyTransformModeUi(
  toolsPaletteController: ControllerViewportToolChrome | null | undefined,
  statusBar: StatusBar | null | undefined,
  mode: TransformMode,
): void {
  toolsPaletteController?.setActiveTransformMode(mode);
  statusBar?.setLastAction(`Transform mode: ${mode}`);
}
