import type { EditorViewport } from '../../viewports/editor_viewport.js';
import { SelectionVisualController } from '../../selection/object/selection_visual_controller.js';
import { ShadingModeHandler } from './shading_mode_handler.js';
import { KeyboardShortcutHandler } from '../input/keyboard_shortcut_handler.js';
import { StatusBar } from '../../ui/status_bar.js';
import { ShadingMode } from '../../types/shading_mode.js';
import { ViewportShadingController } from '../../viewports/viewport_shading_controller.js';

/** Coordinates per-viewport shading modes, toolbars, and keyboard shortcuts. */
export class ShadingModeCoordinator {
  private getViewports: () => readonly EditorViewport[];
  private getViewportElements: () => readonly HTMLElement[];
  private selectionVisualController: SelectionVisualController;
  private statusBar: StatusBar | null;
  private shadingControllers: ViewportShadingController[];
  private shadingModeHandler: ShadingModeHandler;
  private activeViewportIndex: number;
  private activationUnsubscribers: Array<() => void>;
  private onFitViewport: ((viewport: EditorViewport) => void) | null;

  /**
   * Creates shading mode coordination state. Call wireControls to bind UI.
   *
   * @param getViewports Returns live viewports in pane order.
   * @param getViewportElements Returns DOM containers in the same order.
   * @param selectionVisualController Selection visuals that need shading refs.
   * @param statusBar Status bar for shading mode display, or null.
   */
  constructor(
    getViewports: () => readonly EditorViewport[],
    getViewportElements: () => readonly HTMLElement[],
    selectionVisualController: SelectionVisualController,
    statusBar: StatusBar | null,
  ) {
    this.getViewports = getViewports;
    this.getViewportElements = getViewportElements;
    this.selectionVisualController = selectionVisualController;
    this.statusBar = statusBar;
    this.activeViewportIndex = 0;
    this.activationUnsubscribers = [];
    this.onFitViewport = null;
    this.shadingControllers = this.collectShadingControllers();
    this.selectionVisualController.setShadingControllers(this.shadingControllers);
    this.shadingModeHandler = new ShadingModeHandler(this.shadingControllers, this.activeViewportIndex, this.statusBar);
  }

  /**
   * Binds shading keyboard shortcuts, activation tracking, and viewport
   * toolbars.
   *
   * @param keyboardShortcutHandler Keyboard handler for shading keys.
   * @param onFitViewport Callback when a viewport Fit button is pressed.
   */
  wireControls(
    keyboardShortcutHandler: KeyboardShortcutHandler,
    onFitViewport: (viewport: EditorViewport) => void,
  ): void {
    this.onFitViewport = onFitViewport;
    keyboardShortcutHandler.setOnShadingMode((mode) => this.onShadingMode(mode));
    this.rebindViewportUi();
    this.updateShadingMeshes();
    this.syncStatusBarShadingMode();
  }

  /**
   * Rebinds activation listeners and toolbars after the live viewport set
   * changes.
   */
  rebindViewportUi(): void {
    this.clearActivationListeners();
    this.shadingControllers = this.collectShadingControllers();
    this.selectionVisualController.setShadingControllers(this.shadingControllers);
    this.shadingModeHandler = new ShadingModeHandler(
      this.shadingControllers,
      Math.min(this.activeViewportIndex, Math.max(0, this.shadingControllers.length - 1)),
      this.statusBar,
    );
    this.bindViewportActivation();
    if (this.onFitViewport) {
      this.bindViewportToolbars(this.onFitViewport);
    }
  }

  /**
   * Returns the active viewport index within the ordered viewport list.
   *
   * @returns Active viewport index.
   */
  getActiveViewportIndex(): number {
    return this.activeViewportIndex;
  }

  /**
   * Returns viewports in pane order from the live provider.
   *
   * @returns The ordered viewport array.
   */
  getOrderedViewports(): EditorViewport[] {
    return [...this.getViewports()];
  }

  /** Updates the wireframe overlay meshes for all viewports. */
  updateShadingMeshes(): void {
    this.getViewports().forEach((viewport) => {
      viewport.updateShadingMeshes(viewport.collectSelectableObjects());
    });
  }

  /**
   * Collects shading controllers from all viewports.
   *
   * @returns An array of ViewportShadingController instances.
   */
  private collectShadingControllers(): ViewportShadingController[] {
    return this.getViewports().map((viewport) => viewport.getShadingController());
  }

  /** Binds pointer down events to track the active viewport. */
  private bindViewportActivation(): void {
    this.getViewportElements().forEach((el, index) => {
      const listener = () => {
        this.activeViewportIndex = index;
        this.shadingModeHandler.setActiveViewportIndex(index);
        this.syncStatusBarShadingMode();
      };
      el.addEventListener('pointerdown', listener);
      this.activationUnsubscribers.push(() => el.removeEventListener('pointerdown', listener));
    });
  }

  /** Removes previously registered activation listeners. */
  private clearActivationListeners(): void {
    this.activationUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.activationUnsubscribers = [];
  }

  /**
   * Wires shading and Fit actions on each viewport overlay toolbar.
   *
   * @param onFitViewport Callback when Fit is pressed for a viewport.
   */
  private bindViewportToolbars(onFitViewport: (viewport: EditorViewport) => void): void {
    const viewports = this.getOrderedViewports();
    viewports.forEach((viewport, index) => {
      const toolbar = viewport.getViewportToolbar();
      toolbar.setActiveShadingMode(viewport.getShadingMode());
      toolbar.setOnShadingMode((mode) => {
        this.activeViewportIndex = index;
        this.shadingModeHandler.setActiveViewportIndex(index);
        viewport.setShadingMode(mode);
        this.syncStatusBarShadingMode();
      });
      toolbar.setOnFit(() => onFitViewport(viewport));
    });
  }

  /** Writes the active viewport's shading mode into the status bar. */
  private syncStatusBarShadingMode(): void {
    if (!this.statusBar) return;
    const mode = this.shadingModeHandler.getActiveMode();
    const displayName = mode.replace(/\s+/g, '_').toUpperCase();
    this.statusBar.setShadingMode(displayName);
  }

  /**
   * Handles shading mode changes from keyboard shortcuts for the active
   * viewport.
   *
   * @param mode The shading mode to apply.
   */
  private onShadingMode(mode: ShadingMode): void {
    const viewport = this.getOrderedViewports()[this.activeViewportIndex];
    if (!viewport) return;
    viewport.setShadingMode(mode);
    this.syncStatusBarShadingMode();
  }
}
