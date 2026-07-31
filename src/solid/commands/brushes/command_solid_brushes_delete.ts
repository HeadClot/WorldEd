import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

/** Snapshot of a solid brush removed for undo restore. */
interface SolidBrushDeleteSnapshot {
  model: SolidModel;
  instance: SolidBrushInstance;
  listIndex: number;
  /** Scene parent of the preview mesh before delete (root or CSG group). */
  parent: THREE.Object3D | null;
  /** Sibling index under that parent for order restore. */
  siblingIndex: number;
}

/**
 * Undoable deletion of solid brushes that unregisters them from their solid
 * model and rebuilds CSG so they leave the compiled mesh.
 */
export class CommandSolidBrushesDelete implements UndoCommand {
  private readonly brushMeshes: THREE.Mesh[];
  private snapshots: SolidBrushDeleteSnapshot[];
  private executed: boolean;

  /**
   * Creates a solid-brush delete command.
   *
   * @param brushMeshes Solid brush preview meshes to remove.
   */
  constructor(brushMeshes: THREE.Mesh[]) {
    this.brushMeshes = brushMeshes.slice();
    this.snapshots = [];
    this.executed = false;
  }

  /** Removes each brush from its solid model and rebuilds CSG without the brush. */
  execute(): void {
    if (this.executed) return;
    this.snapshots = this.captureSnapshots();
    this.removeCapturedBrushes();
    this.rebuildAffectedModels();
    this.executed = true;
  }

  /** Restores removed brushes at their original list indices and rebuilds. */
  undo(): void {
    if (!this.executed) return;
    const ordered = this.snapshots.slice().sort((left, right) => left.listIndex - right.listIndex);
    for (const snapshot of ordered) {
      this.restoreSnapshot(snapshot);
    }
    this.rebuildAffectedModels();
    this.executed = false;
  }

  /**
   * Disposes brush preview GPU resources when the delete is permanently dropped
   * while brushes remain removed from the scene.
   */
  dispose(): void {
    if (!this.executed) return;
    for (const snapshot of this.snapshots) {
      if (!snapshot.instance.mesh) continue;
      snapshot.model.disposeBrushMeshResources(snapshot.instance.mesh);
    }
  }

  /**
   * Filters meshes to solid brush previews only.
   *
   * @param meshes Candidate meshes.
   * @returns Solid brush meshes.
   */
  static filterBrushMeshes(meshes: THREE.Mesh[]): THREE.Mesh[] {
    return meshes.filter((mesh) => SolidBrushVisual.isBrushObject(mesh));
  }

  /**
   * Captures brush ownership snapshots for the meshes still registered.
   *
   * @returns Snapshot list in capture order.
   */
  private captureSnapshots(): SolidBrushDeleteSnapshot[] {
    const snapshots: SolidBrushDeleteSnapshot[] = [];
    for (const mesh of this.brushMeshes) {
      const snapshot = this.captureOne(mesh);
      if (snapshot) snapshots.push(snapshot);
    }
    return snapshots;
  }

  /**
   * Captures one brush mesh if it still belongs to a solid model.
   *
   * @param mesh Brush preview mesh.
   * @returns Snapshot or null when the brush is missing.
   */
  private captureOne(mesh: THREE.Mesh): SolidBrushDeleteSnapshot | null {
    const model = SolidModel.fromObject(mesh);
    if (!model) return null;
    const brush = model.findBrushByMesh(mesh);
    if (!brush) return null;
    const listIndex = model.getBrushes().findIndex((entry) => entry.id === brush.id);
    if (listIndex < 0) return null;
    brush.pullTransformFromMesh();
    const parent = mesh.parent;
    const siblingIndex = parent ? parent.children.indexOf(mesh) : 0;
    return { model, instance: brush, listIndex, parent, siblingIndex };
  }

  /**
   * Removes all captured brushes without disposing mesh resources and without
   * rebuilding between removals so one partial CSG pass covers the batch.
   */
  private removeCapturedBrushes(): void {
    for (const snapshot of this.snapshots) {
      snapshot.model.removeBrush(snapshot.instance.id, false, false);
    }
  }

  /**
   * Re-inserts one deleted brush at its original evaluation index. Nested
   * brushes are restored under their solid CSG group without reordering
   * root-level brush siblings (which would shove the group above other
   * children).
   *
   * @param snapshot Delete snapshot to restore.
   */
  private restoreSnapshot(snapshot: SolidBrushDeleteSnapshot): void {
    if (snapshot.model.findBrush(snapshot.instance.id)) return;
    snapshot.instance.pushTransformToMesh();
    const hierarchy = this.buildNestedHierarchyPlacement(snapshot);
    snapshot.model.insertBrushInstance(snapshot.instance, snapshot.listIndex, 2, hierarchy, false);
  }

  /**
   * Builds nested hierarchy placement for undo when the brush lived under a
   * solid CSG group. Root-level brushes omit placement so evaluation-list
   * sibling ordering applies.
   *
   * @param snapshot Delete snapshot with parent/sibling capture.
   * @returns Hierarchy placement, or undefined for root-level brushes.
   */
  private buildNestedHierarchyPlacement(
    snapshot: SolidBrushDeleteSnapshot,
  ): { parent: THREE.Object3D; siblingIndex: number } | undefined {
    if (!snapshot.parent || snapshot.parent === snapshot.model.root) return undefined;
    return { parent: snapshot.parent, siblingIndex: snapshot.siblingIndex };
  }

  /**
   * Rebuilds every solid model touched by the current snapshots using whatever
   * partial dirty seeds remove/insert already marked (never force-full).
   */
  private rebuildAffectedModels(): void {
    const models = new Set(this.snapshots.map((entry) => entry.model));
    for (const model of models) {
      model.rebuild(true);
    }
  }
}
