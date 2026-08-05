import type { UndoCommand } from '@/commands/command_undo.js';
import {
  applyObjectTransformToContentMesh,
  restoreObjectApplyMeshSnapshot,
  type ObjectApplyMeshSnapshot,
} from './object_apply_transform_mesh.js';
import {
  applyObjectTransformToSolidBrush,
  restoreObjectApplyBrushSnapshot,
  type ObjectApplyBrushSnapshot,
} from './object_apply_transform_brush.js';
import type { ObjectApplyTransformFlags } from './object_apply_transform_flags.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidModel } from '@/solid/model/solid_model.js';
import type * as THREE from 'three';

/** One content mesh target for apply. */
export interface ObjectApplyMeshTarget {
  kind: 'mesh';
  mesh: THREE.Mesh;
}

/** One solid brush target for apply. */
export interface ObjectApplyBrushTarget {
  kind: 'brush';
  solidModel: SolidModel;
  instance: SolidBrushInstance;
}

/** Apply target union. */
export type ObjectApplyTarget = ObjectApplyMeshTarget | ObjectApplyBrushTarget;

/** Undoable Object → Apply bake for meshes and solid brushes. */
export class CommandObjectApplyTransform implements UndoCommand {
  private readonly flags: ObjectApplyTransformFlags;
  private readonly targets: ObjectApplyTarget[];
  private meshSnapshots: ObjectApplyMeshSnapshot[];
  private brushSnapshots: ObjectApplyBrushSnapshot[];
  private applied: boolean;

  /**
   * Creates an apply command for the given targets and channels.
   *
   * @param flags Bake channels.
   * @param targets Mesh and brush targets.
   */
  constructor(flags: ObjectApplyTransformFlags, targets: readonly ObjectApplyTarget[]) {
    this.flags = flags;
    this.targets = targets.slice();
    this.meshSnapshots = [];
    this.brushSnapshots = [];
    this.applied = false;
  }

  /** Bakes transforms into geometry and clears object channels. */
  execute(): void {
    if (this.applied) {
      this.reapplyFromSnapshots();
      return;
    }
    this.meshSnapshots = [];
    this.brushSnapshots = [];
    for (const target of this.targets) {
      this.executeOneTarget(target);
    }
    this.applied = true;
  }

  /** Restores pre-apply geometry and object poses. */
  undo(): void {
    for (let index = this.meshSnapshots.length - 1; index >= 0; index--) {
      restoreObjectApplyMeshSnapshot(this.meshSnapshots[index]!);
    }
    for (let index = this.brushSnapshots.length - 1; index >= 0; index--) {
      restoreObjectApplyBrushSnapshot(this.brushSnapshots[index]!);
    }
  }

  /**
   * Returns whether any geometry was changed.
   *
   * @returns True when at least one snapshot was recorded.
   */
  didApply(): boolean {
    return this.meshSnapshots.length > 0 || this.brushSnapshots.length > 0;
  }

  /**
   * Applies one target and records a snapshot when work was done.
   *
   * @param target Mesh or brush target.
   */
  private executeOneTarget(target: ObjectApplyTarget): void {
    if (target.kind === 'mesh') {
      const snapshot = applyObjectTransformToContentMesh(target.mesh, this.flags);
      if (snapshot) {
        this.meshSnapshots.push(snapshot);
      }
      return;
    }
    const snapshot = applyObjectTransformToSolidBrush(target.solidModel, target.instance, this.flags);
    if (snapshot) {
      this.brushSnapshots.push(snapshot);
    }
  }

  /** Re-runs bake after undo using the original target set. */
  private reapplyFromSnapshots(): void {
    this.meshSnapshots = [];
    this.brushSnapshots = [];
    for (const target of this.targets) {
      this.executeOneTarget(target);
    }
  }
}
