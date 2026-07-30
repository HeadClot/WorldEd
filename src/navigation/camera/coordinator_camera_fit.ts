import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ControllerCameraFit } from '@/navigation/camera/controller_camera_fit.js';
import { CameraAnimationConfig } from '@/navigation/camera/camera_animation_config.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import { HandlerKeyboardShortcut } from '@/input/handler_keyboard_shortcut.js';

/** Coordinates fit-to-selection camera framing for one or all viewports. */
export class CoordinatorCameraFit {
  private cameraFitController: ControllerCameraFit;
  private cameraAnimationConfig: CameraAnimationConfig;
  private selectionManager: ManagerSelection;
  private statusBar: StatusBar | null;
  private getOrderedViewports: () => Array<ViewportEditor>;
  private getActiveViewportIndex: () => number;

  /**
   * Creates a camera fit coordinator.
   *
   * @param selectionManager Selection source for framing targets.
   * @param statusBar Status bar for fit feedback, or null.
   * @param getOrderedViewports Returns viewports in activation order.
   * @param getActiveViewportIndex Returns the active viewport index.
   */
  constructor(
    selectionManager: ManagerSelection,
    statusBar: StatusBar | null,
    getOrderedViewports: () => Array<ViewportEditor>,
    getActiveViewportIndex: () => number,
  ) {
    this.cameraFitController = new ControllerCameraFit();
    this.cameraAnimationConfig = this.cameraFitController.getConfig();
    this.selectionManager = selectionManager;
    this.statusBar = statusBar;
    this.getOrderedViewports = getOrderedViewports;
    this.getActiveViewportIndex = getActiveViewportIndex;
  }

  /**
   * Binds fit-to-selection keyboard shortcuts.
   *
   * @param keyboardShortcutHandler Keyboard handler to register on.
   */
  bindKeyboardShortcuts(keyboardShortcutHandler: HandlerKeyboardShortcut): void {
    keyboardShortcutHandler.setOnFitToSelection(() => this.onFitToSelection());
    keyboardShortcutHandler.setOnFitAllViewports(() => this.onFitAllViewports());
  }

  /** Advances all active camera fit animations by one frame. */
  updateAnimations(): void {
    this.cameraFitController.updateAnimations();
  }

  /** Fits the currently active viewport to the selection (or whole scene). */
  onFitToSelection(): void {
    const viewport = this.getOrderedViewports()[this.getActiveViewportIndex()];
    if (!viewport) return;
    this.fitSpecificViewport(viewport);
  }

  /**
   * Fits a single viewport camera to the current selection.
   *
   * @param viewport The viewport whose camera should be fitted.
   */
  fitSpecificViewport(viewport: ViewportEditor): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    const count = this.cameraFitController.fitViewportToSelection(viewport, selected, this.cameraAnimationConfig);
    this.showFitFeedback(count);
  }

  /** Fits all viewports to the current selection. */
  onFitAllViewports(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    const count = this.cameraFitController.fitAllViewportsToSelection(
      this.getOrderedViewports(),
      selected,
      this.cameraAnimationConfig,
    );
    this.showFitFeedback(count);
  }

  /**
   * Displays the fit feedback message in the status bar.
   *
   * @param count The number of objects that were framed.
   */
  private showFitFeedback(count: number): void {
    if (!this.statusBar) return;
    this.statusBar.setFitFeedback(`Framed ${count} object(s)`);
    setTimeout(() => {
      this.statusBar?.setFitFeedback('');
    }, 3000);
  }
}
