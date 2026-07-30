import type { ControllerAreaLayout } from './controller_area_layout.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';
import { AreaCornerGesture, type AreaCornerGestureHost, type AreaCornerGestureResult } from './area_corner_gesture.js';
import { AreaSplitterOverlay } from './area_splitter_overlay.js';
import type { ViewportKind } from '@/viewports/core/viewport_kind.js';

/** Host that applies structural layout mutations to the viewport registry. */
export interface AreaLayoutInteractionHost {
  /**
   * Creates a viewport for a newly split area.
   *
   * @param areaId New area id.
   * @param container Pane host element.
   * @param viewportKind Kind to create.
   */
  onAreaAdded(areaId: string, container: HTMLElement, viewportKind: ViewportKind): void;

  /**
   * Removes a viewport when an area is joined away or detached.
   *
   * @param areaId Removed area id.
   */
  onAreaRemoved(areaId: string): void;

  /**
   * Opens a detached viewport window for the given kind.
   *
   * @param viewportKind Kind to open.
   * @returns True when the popup opened.
   */
  onDetachArea(viewportKind: ViewportKind): boolean;

  /** Invoked after geometry-only changes (resize) that need camera resize. */
  onGeometryChanged(): void;

  /** Invoked after structural changes that need full tool rewiring. */
  onStructureChanged(): void;
}

/** Wires splitters and corner gestures to an area layout controller and host. */
export class AreaLayoutInteraction implements AreaCornerGestureHost {
  private readonly controller: ControllerAreaLayout;
  private readonly host: AreaLayoutInteractionHost;
  private readonly splitters: AreaSplitterOverlay;
  private readonly corners: AreaCornerGesture;

  /**
   * Creates interaction overlays for the pane layer.
   *
   * @param paneLayer Absolute pane layer.
   * @param controller Area layout controller.
   * @param host Registry / detach host.
   */
  constructor(paneLayer: HTMLElement, controller: ControllerAreaLayout, host: AreaLayoutInteractionHost) {
    this.controller = controller;
    this.host = host;
    this.splitters = new AreaSplitterOverlay(paneLayer, controller);
    this.corners = new AreaCornerGesture(paneLayer, controller, this);
    this.splitters.setOnResized(() => this.host.onGeometryChanged());
    this.controller.setOnLayoutChanged((placements) => this.onLayoutApplied(placements));
    this.onLayoutApplied(this.controller.getPlacements());
  }

  /**
   * Handles a completed corner gesture.
   *
   * @param result Gesture result.
   */
  onGestureComplete(result: AreaCornerGestureResult): void {
    if (result.type === 'none') return;
    if (result.type === 'split') {
      this.handleSplit(result.areaId, result.direction, result.ratio);
      return;
    }
    if (result.type === 'join') {
      this.handleJoin(result.survivorId, result.removeId);
      return;
    }
    if (result.type === 'detach') {
      this.handleDetach(result.areaId, result.viewportKind);
    }
  }

  /** Disposes interaction overlays. */
  dispose(): void {
    this.splitters.dispose();
    this.corners.dispose();
  }

  /**
   * Rebuilds overlays after placements change. When a pane is maximized,
   * splitters and corner grips are cleared so the full-screen pane cannot be
   * split.
   *
   * @param placements Current placements.
   */
  private onLayoutApplied(placements: readonly AreaLeafPlacement[]): void {
    if (this.controller.isMaximized()) {
      this.splitters.rebuild([]);
      this.corners.rebuild([]);
      return;
    }
    this.splitters.rebuild(placements);
    this.corners.rebuild(placements);
  }

  /**
   * Applies a split, attaches chrome for the new area, then re-applies tiling
   * so the new host keeps absolute geometry instead of relative fill.
   *
   * @param areaId Source area.
   * @param direction Split direction.
   * @param ratio Split ratio.
   */
  private handleSplit(
    areaId: string,
    direction: import('./area_split_direction.js').AreaSplitDirection,
    ratio: number,
  ): void {
    if (this.controller.isMaximized()) return;
    const newPayload = this.controller.splitArea(areaId, direction, ratio);
    if (!newPayload || !newPayload.viewportKind) return;
    const container = this.controller.getLayoutDom().getContainer(newPayload.areaId);
    if (!container) return;
    this.host.onAreaAdded(newPayload.areaId, container, newPayload.viewportKind);
    this.controller.apply({ pruneMissing: true });
    this.host.onStructureChanged();
  }

  /**
   * Applies a join and notifies the host about the removed area.
   *
   * @param survivorId Remaining area.
   * @param removeId Absorbed area.
   */
  private handleJoin(survivorId: string, removeId: string): void {
    if (this.controller.isMaximized()) return;
    if (!this.controller.joinAreas(survivorId, removeId)) return;
    this.host.onAreaRemoved(removeId);
    this.host.onStructureChanged();
  }

  /**
   * Detaches an area into a popup and removes it from the main tiling when open
   * succeeds. Aborts without mutation when the popup is blocked.
   *
   * @param areaId Area to detach.
   * @param viewportKind Kind for the popup.
   */
  private handleDetach(areaId: string, viewportKind: ViewportKind): void {
    if (this.controller.isMaximized()) return;
    if (this.controller.getLeafCount() < 2) return;
    const opened = this.host.onDetachArea(viewportKind);
    if (!opened) return;
    const survivor = this.controller.removeAreaIntoNeighbor(areaId);
    if (!survivor) return;
    this.host.onAreaRemoved(areaId);
    this.host.onStructureChanged();
  }
}
