import type { ViewportPaneCount } from '../../settings/settings_types.js';
import { AreaLayoutController } from './area/area_layout_controller.js';
import { DEFAULT_AREA_IDS } from './area/area_layout_presets.js';
import type { AreaLeafPlacement } from './area/area_leaf_placement.js';
import { listAreaLeafPlacements } from './area/area_layout_tree.js';

/** Historical slot names used by settings and chrome sync. */
export type ViewportSlot = 'top' | 'front' | 'side' | 'perspective';

/**
 * Applies viewport arrangements through the area tiling controller while
 * retaining compatibility helpers (pane count presets, maximize, visible
 * slots).
 */
export class ViewportPaneLayout {
  private readonly controller: AreaLayoutController;
  private readonly areaIdByIndex: string[];

  /**
   * Creates a layout controller for the absolute pane layer.
   *
   * @param paneLayer Absolute host for pane chrome containers.
   * @param _legacyViewports Ignored; containers are owned by the area DOM
   *   layer. Kept so existing call sites compile during migration.
   */
  constructor(paneLayer: HTMLElement, _legacyViewports: readonly HTMLElement[] = []) {
    void _legacyViewports;
    this.controller = new AreaLayoutController(paneLayer);
    this.areaIdByIndex = [
      DEFAULT_AREA_IDS.top,
      DEFAULT_AREA_IDS.front,
      DEFAULT_AREA_IDS.side,
      DEFAULT_AREA_IDS.perspective,
    ];
    this.controller.apply();
  }

  /**
   * Returns the underlying area layout controller.
   *
   * @returns Area layout controller.
   */
  getAreaLayoutController(): AreaLayoutController {
    return this.controller;
  }

  /**
   * Applies the requested visible-pane layout preset (1–4).
   *
   * @param paneCount Number of panes to display.
   */
  apply(paneCount: ViewportPaneCount): void {
    this.controller.applyPaneCountPreset(paneCount);
  }

  /**
   * Returns currently visible historical slot names for settings chrome sync.
   *
   * @returns Visible slot names.
   */
  getVisibleSlots(): readonly ViewportSlot[] {
    const placements = this.controller.getPlacements();
    return placements
      .map((placement) => this.slotForAreaId(placement.payload.areaId))
      .filter((slot): slot is ViewportSlot => slot !== null);
  }

  /**
   * Maximizes one viewport by index, or restores when toggled again.
   *
   * @param viewportIndex Viewport index in default quad order (top, front,
   *   side, perspective) when possible; falls back to logical placement order.
   * @returns Maximized index, or null after restore.
   */
  toggleMaximized(viewportIndex: number): number | null {
    const areaId = this.resolveAreaIdForIndex(viewportIndex);
    if (!areaId) return null;
    const result = this.controller.toggleMaximized(areaId);
    if (result === null) return null;
    return viewportIndex;
  }

  /**
   * Returns current leaf placements after the last apply.
   *
   * @returns Leaf placements.
   */
  getPlacements(): readonly AreaLeafPlacement[] {
    return this.controller.getPlacements();
  }

  /**
   * Registers a layout-change listener on the area controller.
   *
   * @param handler Callback with placements.
   */
  setOnLayoutChanged(handler: ((placements: readonly AreaLeafPlacement[]) => void) | null): void {
    this.controller.setOnLayoutChanged(handler);
  }

  /**
   * Resolves an area id for a maximize index using the logical tree (not the
   * temporary maximized display) so maximize can switch between panes.
   *
   * @param viewportIndex Requested index.
   * @returns Area id or null.
   */
  private resolveAreaIdForIndex(viewportIndex: number): string | null {
    const byDefault = this.areaIdByIndex[viewportIndex];
    if (byDefault) {
      const logicalIds = listAreaLeafPlacements(this.controller.getRoot()).map((item) => item.payload.areaId);
      if (logicalIds.includes(byDefault)) return byDefault;
    }
    const logicalPlacements = listAreaLeafPlacements(this.controller.getRoot());
    return logicalPlacements[viewportIndex]?.payload.areaId ?? null;
  }

  /**
   * Maps a known default area id to a historical slot name.
   *
   * @param areaId Area identifier.
   * @returns Slot name or null when unknown.
   */
  private slotForAreaId(areaId: string): ViewportSlot | null {
    if (areaId === DEFAULT_AREA_IDS.top) return 'top';
    if (areaId === DEFAULT_AREA_IDS.front) return 'front';
    if (areaId === DEFAULT_AREA_IDS.side) return 'side';
    if (areaId === DEFAULT_AREA_IDS.perspective) return 'perspective';
    return null;
  }
}
