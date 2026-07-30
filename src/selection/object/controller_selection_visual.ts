import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { ManagerSelection } from './manager_selection.js';
import { SelectionHighlight } from './selection_highlight.js';
import { ManagerViewportSync } from '@/layout/viewport/manager_viewport_sync.js';
import { ControllerViewportShading } from '@/viewports/shading/controller_viewport_shading.js';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidBrushEdgeFader } from '@/solid/model/solid_brush_edge_fader.js';
import { SolidBrushEdgeBatch } from '@/solid/model/solid_brush_edge_batch.js';

/**
 * Owns selection outline instances across all viewports. Keeps orange outlines
 * glued to meshes during live transforms and after clone rebuilds. Also toggles
 * solid-brush hull fills so only selected brushes draw translucent volumes.
 */
export class ControllerSelectionVisual {
  private selectionManager: ManagerSelection;
  private viewportSyncManager: ManagerViewportSync;
  private selectionHighlights: SelectionHighlight[];
  private shadingControllers: ControllerViewportShading[];
  /** Brush meshes currently showing a translucent hull fill. */
  private hullFillMeshes = new Set<THREE.Mesh>();

  /**
   * Creates a selection visual controller.
   *
   * @param selectionManager The shared selection state.
   * @param viewportSyncManager Used to find 2D clone meshes for a world mesh.
   */
  constructor(selectionManager: ManagerSelection, viewportSyncManager: ManagerViewportSync) {
    this.selectionManager = selectionManager;
    this.viewportSyncManager = viewportSyncManager;
    this.selectionHighlights = [];
    this.shadingControllers = [];
  }

  /**
   * Creates highlight instances for each viewport and wires selection change
   * updates.
   *
   * @param viewports All editor viewports that need selection outlines.
   */
  wireViewports(viewports: Array<Viewport3D | Viewport2D>): void {
    viewports.forEach((viewport) => {
      viewport.setSelectionManager(this.selectionManager);
      const highlight = new SelectionHighlight(viewport.getScene(), Theme);
      viewport.setSelectionHighlight(highlight);
      this.selectionHighlights.push(highlight);
    });
    this.selectionManager.onSelectionChanged(() => this.refreshFromSelection());
  }

  /**
   * Stores shading controllers so wireframe overlays can sync during
   * transforms.
   *
   * @param controllers Per-viewport shading controllers.
   */
  setShadingControllers(controllers: ControllerViewportShading[]): void {
    this.shadingControllers = controllers;
  }

  /** Rebuilds selection outlines for the current selection set. */
  refreshFromSelection(): void {
    this.clearAllHighlights();
    const selected = this.selectionManager.getSelectedObjects();
    selected.forEach((mesh) => this.highlightMeshAndClones(mesh));
    this.syncSolidBrushHullFills();
    this.syncSolidBrushEdgeBatches();
    SolidBrushEdgeFader.invalidateCameraCache();
  }

  /** Re-applies outlines after 2D viewport clones are rebuilt. */
  reapplyAfterViewportSync(): void {
    this.refreshFromSelection();
  }

  /**
   * Rebuilds outline geometry for every currently highlighted mesh. Call after
   * extrude/CSG so orange edges match the new mesh shape.
   */
  rebuildHighlightGeometries(): void {
    this.selectionHighlights.forEach((highlight) => highlight.rebuildGeometries());
  }

  /** Keeps outlines and shading wireframes glued to meshes during live drag. */
  syncDuringTransform(): void {
    this.selectionHighlights.forEach((highlight) => highlight.syncTransforms());
    this.shadingControllers.forEach((controller) => controller.syncOverlayTransforms());
  }

  /** Disposes all highlight resources. */
  dispose(): void {
    this.selectionHighlights.forEach((highlight) => highlight.dispose());
    this.selectionHighlights = [];
  }

  /**
   * Highlights a world mesh and every matching 2D clone.
   *
   * @param mesh The world mesh to outline.
   */
  private highlightMeshAndClones(mesh: THREE.Mesh): void {
    this.applyHighlightToMesh(mesh);
    this.viewportSyncManager
      .findCloneMeshesForWorldUuid(mesh.uuid)
      .forEach((clone) => this.applyHighlightToMesh(clone));
  }

  /**
   * Applies a highlight only in the viewport scene that owns this mesh. Each
   * mesh gets at most one orange outline child (not one per viewport).
   *
   * @param mesh The mesh to highlight.
   */
  private applyHighlightToMesh(mesh: THREE.Mesh): void {
    this.selectionHighlights.forEach((highlight) => {
      highlight.apply(mesh);
    });
  }

  /** Clears outlines from every highlight instance. */
  private clearAllHighlights(): void {
    this.selectionHighlights.forEach((highlight) => highlight.clearAll());
  }

  /**
   * Shows translucent brush hulls only for selected solid brushes (world +
   * clones). Unselected brushes keep operation-colored outlines without filled
   * volumes. Only brushes that enter or leave selection are restyled so maps
   * with thousands of brushes stay interactive.
   */
  private syncSolidBrushHullFills(): void {
    const nextFills = this.collectSelectedBrushMeshes();
    for (const mesh of this.hullFillMeshes) {
      if (nextFills.has(mesh)) continue;
      this.applyBrushHullFillToMeshAndClones(mesh, false);
    }
    for (const mesh of nextFills) {
      if (this.hullFillMeshes.has(mesh)) continue;
      this.applyBrushHullFillToMeshAndClones(mesh, true);
    }
    this.hullFillMeshes = nextFills;
  }

  /**
   * Collects selected solid brush previews that are still parented in a scene.
   * Detached meshes (e.g. mid undo) never keep a filled hull.
   *
   * @returns Set of selected brush meshes that should show hull fill.
   */
  private collectSelectedBrushMeshes(): Set<THREE.Mesh> {
    const nextFills = new Set<THREE.Mesh>();
    for (const mesh of this.selectionManager.getSelectedObjects()) {
      if (!SolidBrushVisual.isBrushObject(mesh)) continue;
      if (!mesh.parent) continue;
      nextFills.add(mesh);
    }
    return nextFills;
  }

  /**
   * Applies hull fill visibility to a world brush mesh and its 2D clones.
   * Always updates the world mesh userData even when detached so undo/redo
   * cannot resurrect a selected fill after the brush is re-parented.
   *
   * @param worldMesh Authoritative brush preview mesh.
   * @param fillVisible Whether the translucent volume should be drawn.
   */
  private applyBrushHullFillToMeshAndClones(worldMesh: THREE.Mesh, fillVisible: boolean): void {
    SolidBrushVisual.setHullFillVisible(worldMesh, fillVisible);
    this.viewportSyncManager
      .findCloneMeshesForWorldUuid(worldMesh.uuid)
      .forEach((clone) => SolidBrushVisual.setHullFillVisible(clone, fillVisible));
  }

  /**
   * Syncs solid-brush edge batch membership with the current selection. Static
   * batches already draw every brush; this only updates the individual set so
   * selection stays cheap on large solids.
   */
  private syncSolidBrushEdgeBatches(): void {
    const individual = this.collectSelectedBrushMeshes();
    const worldObject =
      typeof this.viewportSyncManager.getWorldObject === 'function' ? this.viewportSyncManager.getWorldObject() : null;
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(worldObject, individual);
  }
}
