import { Viewport2D } from '../../viewports/viewport_2d.js';
import { Viewport3D } from '../../viewports/viewport_3d.js';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import { isPerspectiveViewport } from '../../viewports/editor_viewport.js';
import { ViewportKind } from '../../viewports/viewport_kind.js';

/** Named viewport field bag used by legacy call sites and tests. */
export interface NamedViewportFields {
  viewport2DTop: Viewport2D | null;
  viewport2DFront: Viewport2D | null;
  viewport2DSide: Viewport2D | null;
  /**
   * Perspective viewport when one exists. Null when the layout is orthographic
   * only (for example a single remaining 2D pane).
   */
  viewport3D: Viewport3D | null;
}

/**
 * Resolves legacy named viewport fields from the live registry. Falls back to
 * any live instances so disposed references are never retained. Does not cast a
 * 2D viewport as 3D when no perspective pane exists.
 *
 * @param all Live viewports from the registry.
 * @returns Named field bag for top/front/side/perspective roles.
 */
export function resolveNamedViewportFields(all: readonly EditorViewport[]): NamedViewportFields {
  const top = all.find((viewport) => viewport.getViewportKind() === ViewportKind.TOP);
  const front = all.find((viewport) => viewport.getViewportKind() === ViewportKind.FRONT);
  const side = all.find((viewport) => viewport.getViewportKind() === ViewportKind.SIDE);
  const perspective = all.find((viewport) => isPerspectiveViewport(viewport));
  const first2d = all.find((viewport) => viewport instanceof Viewport2D) ?? null;
  const first3d = all.find((viewport) => viewport instanceof Viewport3D) ?? null;
  return {
    viewport2DTop: top instanceof Viewport2D ? top : first2d,
    viewport2DFront: front instanceof Viewport2D ? front : first2d,
    viewport2DSide: side instanceof Viewport2D ? side : first2d,
    viewport3D: perspective instanceof Viewport3D ? perspective : first3d,
  };
}

/**
 * Returns a preferred perspective viewport from a live list.
 *
 * @param viewports Live viewports.
 * @returns Primary Viewport3D when available.
 */
export function findPrimaryPerspectiveViewport(viewports: readonly EditorViewport[]): Viewport3D | null {
  const found = viewports.find((viewport) => isPerspectiveViewport(viewport));
  return found ?? null;
}
