import * as THREE from 'three';
import { ControllerAlignment } from './controller_alignment.js';
import { AlignmentAxis } from '@/types/alignment_axis.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { StatusBar } from '@/ui/status/status_bar.js';

/**
 * Callback invoked after alignment writes object poses. Must run the shared
 * transform-commit refresh (solid CSG finalize + clones + overlays), not a bare
 * viewport reclone.
 *
 * @param objects Objects whose local transforms were written.
 */
export type AfterTransformCommitCallback = (objects: readonly THREE.Object3D[]) => void;

/**
 * Callback invoked to update the status bar axis restriction display.
 *
 * @param axis The current axis restriction label.
 */
export type AxisRestrictionCallback = (axis: AlignmentAxis) => void;

/**
 * Centralized handler for alignment operations. Coordinates alignment
 * execution, pose-commit refresh, and status feedback.
 */
export class HandlerAlignment {
  private alignmentController: ControllerAlignment;
  private commandStack: CommandStack;
  private selectionManager: ManagerSelection;
  private gridSnap: GridSnap;
  private statusBar: StatusBar | null;
  private afterTransformCommit: AfterTransformCommitCallback | null;
  private onAxisRestriction: AxisRestrictionCallback | null;

  /**
   * Creates a new alignment handler.
   *
   * @param alignmentController The core alignment logic controller.
   * @param commandStack The command stack for undo support.
   * @param selectionManager The selection manager.
   * @param gridSnap The grid snap configuration.
   */
  constructor(
    alignmentController: ControllerAlignment,
    commandStack: CommandStack,
    selectionManager: ManagerSelection,
    gridSnap: GridSnap,
  ) {
    this.alignmentController = alignmentController;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.gridSnap = gridSnap;
    this.statusBar = null;
    this.afterTransformCommit = null;
    this.onAxisRestriction = null;
  }

  /**
   * Sets the status bar reference for feedback display.
   *
   * @param statusBar The status bar instance.
   */
  setStatusBar(statusBar: StatusBar): void {
    this.statusBar = statusBar;
  }

  /**
   * Sets the post-pose refresh used after align commands (solid finalize path).
   *
   * @param callback Transform-commit refresh for aligned objects.
   */
  setAfterTransformCommit(callback: AfterTransformCommitCallback): void {
    this.afterTransformCommit = callback;
  }

  /**
   * Sets the callback for axis restriction changes.
   *
   * @param callback The axis restriction update function.
   */
  setOnAxisRestriction(callback: AxisRestrictionCallback): void {
    this.onAxisRestriction = callback;
  }

  /**
   * Cycles the alignment axis restriction and notifies listeners.
   *
   * @returns The new axis restriction.
   */
  cycleAxisRestriction(): AlignmentAxis {
    const axis = this.alignmentController.cycleAxisRestriction();
    this.notifyAxisRestriction(axis);
    return axis;
  }

  /** Aligns selected objects to world origin on the current axis restriction. */
  onAlignToOrigin(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length === 0) return;
    const axis = this.alignmentController.getAxisRestriction();
    this.alignmentController.alignToOrigin(selected, axis, this.commandStack);
    this.commitAlignedPosesAndShowFeedback(selected, 'origin', selected.length);
  }

  /** Aligns selected objects' bounding box centers to the nearest grid cell. */
  onAlignToGridCenter(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length === 0) return;
    const axis = this.alignmentController.getAxisRestriction();
    const snapInterval = this.gridSnap.getInterval();
    this.alignmentController.alignCenterToGrid(selected, axis, snapInterval, this.commandStack);
    this.commitAlignedPosesAndShowFeedback(selected, 'grid center', selected.length);
  }

  /**
   * Aligns source objects to the target reference object. The last selected
   * object serves as the alignment target.
   */
  onAlignToObject(): void {
    const selected = this.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length < 2) return;
    const target = selected[selected.length - 1]!;
    const sources = selected.slice(0, selected.length - 1);
    const axis = this.alignmentController.getAxisRestriction();
    this.alignmentController.alignToObject(sources, target, axis, this.commandStack);
    this.commitAlignedPosesAndShowFeedback(sources, 'object', sources.length);
  }

  /**
   * Returns the current axis restriction.
   *
   * @returns The current alignment axis.
   */
  getAxisRestriction(): AlignmentAxis {
    return this.alignmentController.getAxisRestriction();
  }

  /**
   * Runs the shared pose-commit refresh for aligned objects, then status text.
   *
   * @param alignedObjects Objects whose poses were written by the align
   *   command.
   * @param target The alignment target description.
   * @param count The number of objects aligned.
   */
  private commitAlignedPosesAndShowFeedback(
    alignedObjects: readonly THREE.Object3D[],
    target: string,
    count: number,
  ): void {
    this.afterTransformCommit?.(alignedObjects);
    this.showAlignmentFeedback(target, count);
  }

  /**
   * Displays alignment feedback in the status bar.
   *
   * @param target The alignment target description.
   * @param count The number of objects aligned.
   */
  private showAlignmentFeedback(target: string, count: number): void {
    if (this.statusBar) {
      this.statusBar.setLastAction(`Aligned ${count} object(s) to ${target}`);
    }
  }

  /**
   * Notifies the axis restriction callback of a change.
   *
   * @param axis The new axis restriction.
   */
  private notifyAxisRestriction(axis: AlignmentAxis): void {
    if (this.onAxisRestriction) {
      this.onAxisRestriction(axis);
    }
  }
}
