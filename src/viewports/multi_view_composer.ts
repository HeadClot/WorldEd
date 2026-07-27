import * as THREE from 'three';
import { Theme } from '../theme.js';
import { measurePaneLogicalRectAgainst } from './pane_content_rect.js';
import type { RenderSurface, SurfaceRenderPane } from './render_surface.js';

/** Pane contribution for one multi-view frame. */
export interface MultiViewPanePass {
  camera: THREE.Camera;
  /**
   * Drawable DOM box for this pane (content under the title bar). Scissor and
   * camera aspect use this box so GL does not draw under chrome.
   */
  contentElement: HTMLElement;
  /**
   * Optional camera resize using the exact scissor pixel size (keeps grids
   * sharp by matching projection to the drawable box).
   *
   * @param width Scissor width in logical pixels.
   * @param height Scissor height in logical pixels.
   */
  syncCameraSize?: (width: number, height: number) => void;
  /** Optional prepare hook (grids, shading, gizmo visibility). */
  prepare?: () => void;
  /** Optional finalize hook after the pane is drawn. */
  finalize?: () => void;
}

/** Builds scissor passes and draws all active panes through one render surface. */
export class MultiViewComposer {
  private surface: RenderSurface;

  /**
   * Creates a composer bound to a render surface.
   *
   * @param surface Shared workspace surface (or future detached surface).
   */
  constructor(surface: RenderSurface) {
    this.surface = surface;
  }

  /**
   * Rebinds the composer to a different surface.
   *
   * @param surface New render surface.
   */
  setSurface(surface: RenderSurface): void {
    this.surface = surface;
  }

  /**
   * Renders every provided pane into the shared surface.
   *
   * @param scene Shared editor scene.
   * @param panes Active multi-view panes.
   * @param clearColor Optional full-canvas clear (defaults to separator).
   */
  render(scene: THREE.Scene, panes: readonly MultiViewPanePass[], clearColor: number = Theme.separatorColor): void {
    this.surface.syncSizeFromWorkspace();
    const canvas = this.surface.getCanvas();
    const logicalSize = this.surface.getLogicalSize();
    const surfacePanes: SurfaceRenderPane[] = panes.map((pane) => {
      const viewportRect = measurePaneLogicalRectAgainst(
        pane.contentElement,
        canvas,
        logicalSize.width,
        logicalSize.height,
      );
      if (viewportRect.width > 0 && viewportRect.height > 0) {
        pane.syncCameraSize?.(viewportRect.width, viewportRect.height);
      }
      return this.toSurfaceRenderPane(pane, viewportRect);
    });
    this.surface.renderPanes(scene, surfacePanes, clearColor);
  }

  /**
   * Builds a surface pane, omitting optional hooks when absent so
   * exactOptionalPropertyTypes is satisfied.
   *
   * @param pane Multi-view pane pass.
   * @param viewportRect Measured scissor rect for the pane.
   * @returns Surface pane for renderPanes.
   */
  private toSurfaceRenderPane(
    pane: MultiViewPanePass,
    viewportRect: SurfaceRenderPane['viewportRect'],
  ): SurfaceRenderPane {
    const surfacePane: SurfaceRenderPane = {
      camera: pane.camera,
      viewportRect,
    };
    if (pane.prepare) {
      surfacePane.prepare = pane.prepare;
    }
    if (pane.finalize) {
      surfacePane.finalize = pane.finalize;
    }
    return surfacePane;
  }
}
