import type * as THREE from 'three';
import type { PaneLogicalRect } from './pane_content_rect.js';

/** One pane pass for a multi-view composer. */
export interface SurfaceRenderPane {
  camera: THREE.Camera;
  /**
   * Scissor/viewport rect in logical CSS pixels (Three.js setViewport units).
   * Origin is canvas lower-left.
   */
  viewportRect: PaneLogicalRect;
  /** Optional work run immediately before this pane's render. */
  prepare?: () => void;
  /** Optional work run immediately after this pane's render. */
  finalize?: () => void;
}

/**
 * Abstraction over the default shared workspace surface and future detached
 * window surfaces. Default editor path uses a single shared surface only.
 */
export interface RenderSurface {
  /**
   * Returns the shared WebGL renderer.
   *
   * @returns Three.js WebGL renderer.
   */
  getRenderer(): THREE.WebGLRenderer;

  /**
   * Returns the drawing canvas.
   *
   * @returns HTML canvas element.
   */
  getCanvas(): HTMLCanvasElement;

  /**
   * Returns the workspace host used for layout measurement and setSize.
   *
   * @returns Workspace HTML element.
   */
  getWorkspaceElement(): HTMLElement;

  /**
   * Returns the last logical (CSS) size passed to setSize.
   *
   * @returns Width and height in logical pixels.
   */
  getLogicalSize(): { width: number; height: number };

  /**
   * Resizes the drawing buffer to match the workspace element.
   *
   * @param cssWidth CSS width in pixels.
   * @param cssHeight CSS height in pixels.
   */
  resize(cssWidth: number, cssHeight: number): void;

  /** Syncs the drawing buffer to the workspace host's current client size. */
  syncSizeFromWorkspace(): void;

  /**
   * Renders the given panes with scissor isolation.
   *
   * @param scene Shared scene.
   * @param panes Active panes with cameras and rects.
   * @param clearColor Background clear color.
   */
  renderPanes(scene: THREE.Scene, panes: readonly SurfaceRenderPane[], clearColor: number): void;

  /** Releases GPU resources. */
  dispose(): void;
}
