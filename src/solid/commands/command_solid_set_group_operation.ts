import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  getSolidGroupOperation,
  isSolidCsgGroup,
  markAsSolidCsgGroup,
  setSolidGroupOperation,
} from '@/solid/model/solid_group.js';

/** Snapshot of one solid group operation for undo. */
interface GroupOperationSnapshot {
  group: THREE.Group;
  previousOperation: SolidOperation;
  model: SolidModel;
}

/**
 * Undoable command that sets the CSG operation on solid compound groups. Forces
 * a full solid rebuild so hierarchical routing reflects the new branch
 * operation.
 */
export class CommandSolidSetGroupOperation implements UndoCommand {
  private readonly groups: THREE.Group[];
  private readonly operation: SolidOperation;
  private snapshots: GroupOperationSnapshot[];
  private executed: boolean;

  /**
   * Creates a set-operation command for solid CSG groups.
   *
   * @param groups Solid CSG groups to update.
   * @param operation New CSG operation for each group.
   */
  constructor(groups: THREE.Group[], operation: SolidOperation) {
    this.groups = groups.slice();
    this.operation = operation;
    this.snapshots = [];
    this.executed = false;
  }

  /** Applies the operation to each solid group and rebuilds owning solids. */
  execute(): void {
    if (this.executed) return;
    this.snapshots = [];
    for (const group of this.groups) {
      this.applyToGroup(group);
    }
    this.rebuildAffectedModels();
    if (this.snapshots.length === 0) return;
    this.executed = true;
  }

  /** Restores prior group operations and rebuilds. */
  undo(): void {
    if (!this.executed) return;
    for (const snapshot of this.snapshots) {
      setSolidGroupOperation(snapshot.group, snapshot.previousOperation);
    }
    this.rebuildAffectedModels();
    this.snapshots = [];
    this.executed = false;
  }

  /**
   * Snapshots and updates one group operation.
   *
   * @param group Solid CSG group.
   */
  private applyToGroup(group: THREE.Group): void {
    const model = SolidModel.fromObject(group);
    if (!model) return;
    const previous = isSolidCsgGroup(group) ? getSolidGroupOperation(group) : SolidOperation.Additive;
    if (isSolidCsgGroup(group) && previous === this.operation) return;
    this.snapshots.push({ group, previousOperation: previous, model });
    markAsSolidCsgGroup(group, this.operation);
    setSolidGroupOperation(group, this.operation);
  }

  /** Full rebuilds every solid model touched by this command. */
  private rebuildAffectedModels(): void {
    const models = new Set(this.snapshots.map((snapshot) => snapshot.model));
    for (const model of models) {
      model.markDirty();
      model.rebuild(true);
    }
  }
}
