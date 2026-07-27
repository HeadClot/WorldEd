import { Viewport2D } from './viewport_2d.js';
import { Viewport3D } from './viewport_3d.js';
import { ViewportKind, getViewportKindMetadata, isPerspectiveViewportKind } from './viewport_kind.js';
import type { CadViewPlane } from '../rulers/cad_view_plane.js';
import type { GridPlane } from './grid/grid_plane.js';

/** Live editor viewport instance hosted in a layout pane. */
export type EditorViewport = Viewport2D | Viewport3D;

/**
 * Returns whether the viewport is a perspective 3D instance.
 *
 * @param viewport Live viewport.
 * @returns True when the instance is Viewport3D.
 */
export function isPerspectiveViewport(viewport: EditorViewport): viewport is Viewport3D {
  return viewport instanceof Viewport3D;
}

/**
 * Returns whether the viewport is an orthographic 2D instance.
 *
 * @param viewport Live viewport.
 * @returns True when the instance is Viewport2D.
 */
export function isOrthographicViewport(viewport: EditorViewport): viewport is Viewport2D {
  return viewport instanceof Viewport2D;
}

/**
 * Returns the CAD view plane for a viewport kind.
 *
 * @param kind Viewport kind.
 * @returns CAD placement plane.
 */
export function getCadViewPlaneForKind(kind: ViewportKind): CadViewPlane {
  return getViewportKindMetadata(kind).cadViewPlane;
}

/**
 * Returns the gizmo clone plane key for a viewport kind.
 *
 * @param kind Viewport kind.
 * @returns Grid plane or full 3D key.
 */
export function getGizmoPlaneForKind(kind: ViewportKind): GridPlane | 'xyz' {
  return getViewportKindMetadata(kind).gizmoPlane;
}

/**
 * Returns whether a kind prefers hosting the authoritative world object.
 *
 * @param kind Viewport kind.
 * @returns True for perspective kinds.
 */
export function kindPrefersWorldHost(kind: ViewportKind): boolean {
  return getViewportKindMetadata(kind).prefersWorldHost;
}

/**
 * Returns whether the given kind uses a perspective projection.
 *
 * @param kind Viewport kind.
 * @returns True for perspective.
 */
export function kindIsPerspective(kind: ViewportKind): boolean {
  return isPerspectiveViewportKind(kind);
}
