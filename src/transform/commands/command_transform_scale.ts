import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { GizmoAxis } from '@/types/transform_mode.js';

/**
 * Snapshot of an object's transform for a scale operation. Optional final pose
 * fields commit the live drag result without re-baking axis-factor math.
 */
export interface ObjectScaleSnapshot {
  object: THREE.Object3D;
  originalPosition: THREE.Vector3;
  originalScale: THREE.Vector3;
  finalPosition?: THREE.Vector3;
  finalScale?: THREE.Vector3;
}

/**
 * Undoable command for scale operations. Prefers explicit final poses so free
 * uniform and parented live previews survive command push.
 */
export class CommandTransformScale implements UndoCommand {
  private snapshots: ObjectScaleSnapshot[];
  private pivot: THREE.Vector3;
  private axis: THREE.Vector3;
  private factor: number;
  private gizmoAxis: GizmoAxis;

  /**
   * Creates a new scale command.
   *
   * @param snapshots The scale snapshots of all affected objects.
   * @param pivot The scale pivot point for axis-factor fallback.
   * @param axis The scaling axis vector in world space for fallback.
   * @param factor The scale factor multiplier relative to original state.
   * @param gizmoAxis Local scale component the handle maps to.
   */
  constructor(
    snapshots: ObjectScaleSnapshot[],
    pivot: THREE.Vector3,
    axis: THREE.Vector3,
    factor: number,
    gizmoAxis: GizmoAxis = GizmoAxis.X,
  ) {
    this.snapshots = snapshots;
    this.pivot = pivot.clone();
    this.axis = axis.clone();
    this.factor = factor;
    this.gizmoAxis = gizmoAxis;
  }

  /**
   * Applies stored final poses when present, otherwise axis-factor from
   * original.
   */
  execute(): void {
    this.snapshots.forEach((snapshot) => {
      this.applySnapshotExecute(snapshot);
    });
  }

  /** Undoes the scaling by restoring original positions and scales. */
  undo(): void {
    this.snapshots.forEach((snapshot) => {
      snapshot.object.position.copy(snapshot.originalPosition);
      snapshot.object.scale.copy(snapshot.originalScale);
    });
  }

  /**
   * Writes one object to its committed pose or axis-factor fallback.
   *
   * @param snapshot Object snapshot to apply.
   */
  private applySnapshotExecute(snapshot: ObjectScaleSnapshot): void {
    if (this.applyFinalPoseWhenPresent(snapshot)) {
      return;
    }
    this.applyAxisFactorFromOriginal(snapshot);
  }

  /**
   * Copies final position and scale when both were recorded at drag end.
   *
   * @param snapshot Object snapshot that may include final pose fields.
   * @returns True when a final pose was applied.
   */
  private applyFinalPoseWhenPresent(snapshot: ObjectScaleSnapshot): boolean {
    const finalPosition = snapshot.finalPosition;
    const finalScale = snapshot.finalScale;
    if (!finalPosition || !finalScale) {
      return false;
    }
    snapshot.object.position.copy(finalPosition);
    snapshot.object.scale.copy(finalScale);
    return true;
  }

  /**
   * Recomputes position and scale from original local pose via axis factor.
   *
   * @param snapshot Object snapshot without final pose fields.
   */
  private applyAxisFactorFromOriginal(snapshot: ObjectScaleSnapshot): void {
    const normalizedAxis = this.axis.clone().normalize();
    const safeFactor = Math.max(0.01, this.factor);
    const relativePos = snapshot.originalPosition.clone().sub(this.pivot);
    const projection = relativePos.dot(normalizedAxis);
    const scaledRelative = relativePos
      .clone()
      .sub(normalizedAxis.clone().multiplyScalar(projection))
      .add(normalizedAxis.clone().multiplyScalar(projection * safeFactor));
    snapshot.object.position.copy(scaledRelative.add(this.pivot));
    snapshot.object.scale.copy(snapshot.originalScale);
    this.multiplyLocalScaleComponent(snapshot.object.scale, safeFactor);
  }

  /**
   * Multiplies the local scale component for the active gizmo axis.
   *
   * @param scale Scale vector modified in place.
   * @param factor Multiplicative factor.
   */
  private multiplyLocalScaleComponent(scale: THREE.Vector3, factor: number): void {
    if (this.gizmoAxis === GizmoAxis.X) {
      scale.x = Math.max(0.01, scale.x * factor);
      return;
    }
    if (this.gizmoAxis === GizmoAxis.Y) {
      scale.y = Math.max(0.01, scale.y * factor);
      return;
    }
    if (this.gizmoAxis === GizmoAxis.Z) {
      scale.z = Math.max(0.01, scale.z * factor);
      return;
    }
    scale.x = Math.max(0.01, scale.x * factor);
    scale.y = Math.max(0.01, scale.y * factor);
    scale.z = Math.max(0.01, scale.z * factor);
  }
}
