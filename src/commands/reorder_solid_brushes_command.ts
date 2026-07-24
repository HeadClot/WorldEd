import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { SolidModel } from '../solid/model/solid_model.js';

/**
 * Placement target for solid brush evaluation order.
 */
export type SolidBrushOrderEnd = 'first' | 'last';

/**
 * Snapshot of one solid model's brush order for undo.
 */
interface OrderSnapshot {
  model: SolidModel;
  previousOrder: string[];
}

/**
 * Undoable command that moves solid brushes to first or last CSG order.
 */
export class ReorderSolidBrushesCommand implements UndoCommand {
  private readonly brushMeshes: THREE.Mesh[];
  private readonly end: SolidBrushOrderEnd;
  private snapshots: OrderSnapshot[];
  private executed: boolean;

  /**
   * Creates a brush reorder command.
   * @param brushMeshes Brush preview meshes to move.
   * @param end Target end of the evaluation list.
   */
  constructor(brushMeshes: THREE.Mesh[], end: SolidBrushOrderEnd) {
    this.brushMeshes = brushMeshes.slice();
    this.end = end;
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Moves brushes to the target end and rebuilds affected solids.
   */
  execute(): void {
    if (this.executed) return;
    this.snapshots = [];
    const byModel = this.groupMeshesByModel();
    byModel.forEach((meshes, model) => {
      const previousOrder = model.getBrushes().map((brush) => brush.id);
      const brushIds = meshes
        .map((mesh) => model.findBrushByMesh(mesh)?.id)
        .filter((id): id is string => !!id);
      if (brushIds.length === 0) return;
      const changed =
        this.end === 'first'
          ? model.moveBrushesToFirst(brushIds)
          : model.moveBrushesToLast(brushIds);
      if (!changed) return;
      this.snapshots.push({ model, previousOrder });
    });
    this.executed = this.snapshots.length > 0;
  }

  /**
   * Restores prior evaluation order for each affected solid.
   */
  undo(): void {
    if (!this.executed) return;
    for (const snapshot of this.snapshots) {
      snapshot.model.applyBrushOrder(snapshot.previousOrder);
    }
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Groups brush meshes by owning solid model.
   * @returns Map of model to meshes.
   */
  private groupMeshesByModel(): Map<SolidModel, THREE.Mesh[]> {
    const byModel = new Map<SolidModel, THREE.Mesh[]>();
    for (const mesh of this.brushMeshes) {
      const model = SolidModel.fromObject(mesh);
      if (!model) continue;
      const list = byModel.get(model);
      if (list) list.push(mesh);
      else byModel.set(model, [mesh]);
    }
    return byModel;
  }
}
