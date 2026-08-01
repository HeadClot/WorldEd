import * as THREE from 'three';
import { GizmoAxis } from '@/types/transform_mode.js';
import { TransformMode } from '@/types/transform_mode.js';
import { TransformModalAxis } from './transform_modal_axis.js';

/**
 * Callbacks the modal controller uses to re-apply transforms without owning
 * drag session internals.
 */
export interface TransformModalApplyHost {
  /**
   * Returns whether a transform drag is active.
   *
   * @returns True during drag.
   */
  isDragging(): boolean;

  /**
   * Returns the active transform mode.
   *
   * @returns Transform mode.
   */
  getMode(): TransformMode;

  /**
   * Returns the active gizmo handle axis, or null.
   *
   * @returns Gizmo axis.
   */
  getActiveAxis(): GizmoAxis | null;

  /**
   * Returns whether the drag is a single-use keyboard tool session (G/R/S).
   *
   * @returns True during single-use.
   */
  isSingleUseDrag(): boolean;

  /**
   * Returns the gizmo world orientation for local/global axes.
   *
   * @returns Orientation quaternion.
   */
  getOrientation(): THREE.Quaternion;

  /**
   * Returns objects currently being transformed.
   *
   * @returns Drag target objects.
   */
  getDragObjects(): THREE.Object3D[];

  /**
   * Returns the drag pivot in world space.
   *
   * @returns Pivot point.
   */
  getDragPivot(): THREE.Vector3;

  /**
   * Re-applies the last mouse-driven transform with the current modal axis
   * lock.
   */
  reapplyMouseDrivenTransform(): void;

  /**
   * Applies a typed numeric value along the effective axis.
   *
   * @param value Parsed numeric value.
   * @param axis Effective single axis.
   * @returns True when the value was applied.
   */
  applyNumericValue(value: number, axis: TransformModalAxis): boolean;

  /** Commits the active drag (push undo and clear drag state). */
  commitDrag(): void;

  /** Cancels the active drag and restores pre-drag transforms without undo. */
  cancelDrag(): void;

  /**
   * Updates the RGB constraint guide line for a modal axis lock.
   *
   * @param axis Modal axis lock (None hides the line).
   */
  setConstraintLineAxis(axis: TransformModalAxis): void;

  /**
   * Publishes modal status text to the UI (empty clears).
   *
   * @param text Status label.
   */
  setStatusText(text: string): void;
}
