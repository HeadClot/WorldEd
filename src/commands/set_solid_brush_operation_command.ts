import * as THREE from 'three';
import { UndoCommand } from './undo_command.js';
import { SolidModel } from '../solid/model/solid_model.js';
import { SolidOperation } from '../solid/types/solid_operation.js';

/**
 * Snapshot of one brush operation for undo.
 */
interface OperationSnapshot {
  model: SolidModel;
  brushId: string;
  previousOperation: SolidOperation;
}

/**
 * Undoable command that sets the CSG operation on one or more solid brushes.
 * Uses partial CSG via setBrushOperation — never force-rebuilds the entire map.
 */
export class SetSolidBrushOperationCommand implements UndoCommand {
  private readonly brushMeshes: THREE.Mesh[];
  private readonly operation: SolidOperation;
  private snapshots: OperationSnapshot[];
  private executed: boolean;

  /**
   * Creates a set-operation command for solid brushes.
   * @param brushMeshes Brush preview meshes to update.
   * @param operation New CSG operation.
   */
  constructor(brushMeshes: THREE.Mesh[], operation: SolidOperation) {
    this.brushMeshes = brushMeshes.slice();
    this.operation = operation;
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Applies the operation to each brush (partial CSG rebuild per model).
   */
  execute(): void {
    if (this.executed) return;
    this.snapshots = [];
    for (const mesh of this.brushMeshes) {
      this.applyToMesh(mesh);
    }
    if (this.snapshots.length === 0) return;
    this.executed = true;
  }

  /**
   * Restores prior operations with partial CSG rebuilds.
   */
  undo(): void {
    if (!this.executed) return;
    for (const snapshot of this.snapshots) {
      snapshot.model.setBrushOperation(snapshot.brushId, snapshot.previousOperation);
    }
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Snapshots and updates one brush mesh operation.
   * @param mesh Brush preview mesh.
   */
  private applyToMesh(mesh: THREE.Mesh): void {
    const model = SolidModel.fromObject(mesh);
    if (!model) return;
    const brush = model.findBrushByMesh(mesh);
    if (!brush) return;
    if (brush.operation === this.operation) return;
    this.snapshots.push({
      model,
      brushId: brush.id,
      previousOperation: brush.operation,
    });
    model.setBrushOperation(brush.id, this.operation);
  }
}
