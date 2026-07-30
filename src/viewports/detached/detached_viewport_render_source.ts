import type * as THREE from 'three';

/**
 * Live scene source for detached multi-monitor viewports. The main editor
 * supplies the shared scene; real viewports are created only while popups are
 * open so toolbar, grid, shading, and navigation stay shared code.
 */
export interface DetachedViewportRenderSource {
  /**
   * Returns the shared editor scene to draw.
   *
   * @returns Scene instance.
   */
  getScene: () => THREE.Scene;

  /**
   * Optional seed camera pose when a perspective popup first opens.
   *
   * @returns Source camera, or null to use default placement.
   */
  getSeedCamera?: () => THREE.Camera | null;

  /**
   * Optional world root for selection/helpers on the detached pane.
   *
   * @returns World group or null.
   */
  getWorldObject?: () => THREE.Group | null;
}
