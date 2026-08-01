import type { Camera } from 'three';

/**
 * Camera and DOM pick surface for one interactive editor pane. Tools resolve
 * this from a client point so 2D and 3D panes share the same input path.
 */
export interface EditorViewportPickContext {
  /** Camera used for raycasting and NDC in this pane. */
  camera: Camera;
  /** Content element that owns pointer listeners and NDC metrics. */
  pickElement: HTMLElement;
}
