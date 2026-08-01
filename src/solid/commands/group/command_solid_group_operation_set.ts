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
import { hierarchySeedBrushIdsCollectUnder } from '@/solid/model/hierarchy/solid_hierarchy_seed_collector.js';

/** Snapshot of one solid group operation for undo. */
interface GroupOperationSnapshot {
  group: THREE.Group;
  previousOperation: SolidOperation;
  model: SolidModel;
}

/**
 * Undoable command that sets the CSG operation on solid compound groups. Uses
 * peer-local partial recompile (group leaf brushes + touch peers), matching
 * brush operation edits — not a full map rebuild.
 */
export class CommandSolidGroupOperationSet implements UndoCommand {
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

  /** Partially rebuilds every solid model that owns a changed group. */
  private rebuildAffectedModels(): void {
    const groupsByModel = this.collectGroupsByModel();
    groupsByModel.forEach((groups, model) => {
      this.rebuildModelAfterGroupOperationChange(model, groups);
    });
  }

  /**
   * Groups snapshots by owning solid model.
   *
   * @returns Map of model to groups whose operation changed.
   */
  private collectGroupsByModel(): Map<SolidModel, THREE.Group[]> {
    const groupsByModel = new Map<SolidModel, THREE.Group[]>();
    for (const snapshot of this.snapshots) {
      const list = groupsByModel.get(snapshot.model);
      if (list) {
        list.push(snapshot.group);
        continue;
      }
      groupsByModel.set(snapshot.model, [snapshot.group]);
    }
    return groupsByModel;
  }

  /**
   * Seeds dirty brushes from group leaves, expands cached touch peers, clears
   * routing tables, and runs a partial CSG rebuild.
   *
   * @param model Owning solid model.
   * @param groups Groups under this model whose operation changed.
   */
  private rebuildModelAfterGroupOperationChange(model: SolidModel, groups: readonly THREE.Group[]): void {
    const seedBrushIds = this.collectSeedBrushIds(model, groups);
    const dirty = this.expandSeedsWithTouchPeers(model, seedBrushIds);
    model.clearRoutingTables();
    if (dirty.size === 0) {
      model.markDirty();
    } else {
      model.markBrushesDirty(dirty);
    }
    model.rebuild(true, { skipEdgeBatchRefresh: true });
  }

  /**
   * Collects brush ids under the given groups.
   *
   * @param model Owning solid model.
   * @param groups Solid CSG groups.
   * @returns Unique leaf brush ids.
   */
  private collectSeedBrushIds(model: SolidModel, groups: readonly THREE.Group[]): string[] {
    const seedIds = new Set<string>();
    for (const group of groups) {
      for (const brushId of hierarchySeedBrushIdsCollectUnder(model, group)) {
        seedIds.add(brushId);
      }
    }
    return Array.from(seedIds);
  }

  /**
   * Builds the dirty set from seeds plus one-hop cached touch peers.
   *
   * @param model Solid model.
   * @param seedBrushIds Group leaf brush ids.
   * @returns Dirty brush id set.
   */
  private expandSeedsWithTouchPeers(model: SolidModel, seedBrushIds: readonly string[]): Set<string> {
    const dirty = new Set<string>(seedBrushIds);
    for (const brushId of seedBrushIds) {
      for (const peerId of model.getCachedTouchPeerIds(brushId)) {
        dirty.add(peerId);
      }
    }
    return dirty;
  }
}
