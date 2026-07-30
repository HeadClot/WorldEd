import type { GridPlane } from '@/viewports/grid/grid_plane.js';
import type { CadViewPlane } from '@/rulers/view/cad_view_plane.js';

/**
 * Projection and framing kind for an editor viewport pane. Independent of
 * layout slot identity so any pane can host any kind.
 */
export enum ViewportKind {
  TOP = 'top',
  FRONT = 'front',
  SIDE = 'side',
  PERSPECTIVE = 'perspective',
}

/** Static metadata describing how a viewport kind behaves. */
export interface ViewportKindMetadata {
  kind: ViewportKind;
  displayLabel: string;
  isPerspective: boolean;
  /** Orthographic grid plane; perspective uses floor grid on xz. */
  gridPlane: GridPlane;
  cadViewPlane: CadViewPlane;
  /** Transform gizmo plane key used when cloning handles. */
  gizmoPlane: GridPlane | 'xyz';
  prefersWorldHost: boolean;
}

const KIND_METADATA: Readonly<Record<ViewportKind, ViewportKindMetadata>> = {
  [ViewportKind.TOP]: {
    kind: ViewportKind.TOP,
    displayLabel: 'Top',
    isPerspective: false,
    gridPlane: 'xz',
    cadViewPlane: 'xz',
    gizmoPlane: 'xz',
    prefersWorldHost: false,
  },
  [ViewportKind.FRONT]: {
    kind: ViewportKind.FRONT,
    displayLabel: 'Front',
    isPerspective: false,
    gridPlane: 'xy',
    cadViewPlane: 'xy',
    gizmoPlane: 'xy',
    prefersWorldHost: false,
  },
  [ViewportKind.SIDE]: {
    kind: ViewportKind.SIDE,
    displayLabel: 'Side',
    isPerspective: false,
    gridPlane: 'yz',
    cadViewPlane: 'yz',
    gizmoPlane: 'yz',
    prefersWorldHost: false,
  },
  [ViewportKind.PERSPECTIVE]: {
    kind: ViewportKind.PERSPECTIVE,
    displayLabel: 'Perspective',
    isPerspective: true,
    gridPlane: 'xz',
    cadViewPlane: 'xyz',
    gizmoPlane: 'xyz',
    prefersWorldHost: true,
  },
};

/** Ordered kinds for type menus and default quad creation. */
export const VIEWPORT_KIND_MENU_ORDER: readonly ViewportKind[] = [
  ViewportKind.TOP,
  ViewportKind.FRONT,
  ViewportKind.SIDE,
  ViewportKind.PERSPECTIVE,
];

/** Default four-pane startup kinds in layout order. */
export const DEFAULT_VIEWPORT_QUAD_KINDS: readonly ViewportKind[] = [
  ViewportKind.TOP,
  ViewportKind.FRONT,
  ViewportKind.SIDE,
  ViewportKind.PERSPECTIVE,
];

/**
 * Returns metadata for a viewport kind.
 *
 * @param kind Viewport kind to describe.
 * @returns Immutable metadata record.
 */
export function getViewportKindMetadata(kind: ViewportKind): ViewportKindMetadata {
  return KIND_METADATA[kind];
}

/**
 * Returns the toolbar / menu display label for a kind.
 *
 * @param kind Viewport kind.
 * @returns Human-readable label (e.g. "Top").
 */
export function getViewportKindDisplayLabel(kind: ViewportKind): string {
  return KIND_METADATA[kind].displayLabel;
}

/**
 * Returns whether the kind uses a perspective camera.
 *
 * @param kind Viewport kind.
 * @returns True for perspective viewports.
 */
export function isPerspectiveViewportKind(kind: ViewportKind): boolean {
  return KIND_METADATA[kind].isPerspective;
}

/**
 * Parses a raw string into a ViewportKind when valid.
 *
 * @param value Candidate kind string.
 * @returns Matching kind or null.
 */
export function parseViewportKind(value: string): ViewportKind | null {
  const kinds = Object.values(ViewportKind) as string[];
  if (!kinds.includes(value)) return null;
  return value as ViewportKind;
}
