import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';

/**
 * Snapshot capturing a child of a group before ungrouping. Children are
 * restored in snapshot order on undo.
 */
export interface UngroupChildSnapshot {
  /** The child object that was in the group. */
  child: THREE.Object3D;
}

/**
 * Undoable command for ungrouping a group object. Execute reparents children to
 * the group's parent at the group's former sibling index (preserving outliner
 * and CSG evaluation order). Undo restores the group.
 */
export class CommandObjectUngroup implements UndoCommand {
  private group: THREE.Group;
  private originalParent: THREE.Object3D | null;
  private groupSiblingIndex: number;
  private childSnapshots: UngroupChildSnapshot[];
  private executed: boolean;

  /**
   * Creates a new ungroup command for the specified group.
   *
   * @param group The group object to ungroup.
   */
  constructor(group: THREE.Group) {
    this.group = group;
    this.originalParent = group.parent;
    this.groupSiblingIndex = this.originalParent ? this.originalParent.children.indexOf(group) : 0;
    this.childSnapshots = this.buildSnapshots(group);
    this.executed = false;
  }

  /**
   * Moves children to the group's parent at the group's former sibling slot,
   * then removes the empty group.
   */
  execute(): void {
    if (this.executed) {
      return;
    }
    const children = this.groupChildrenDetach();
    this.groupDetachFromParent();
    this.childrenInsertAtGroupSlot(children);
    this.executed = true;
  }

  /** Restores children into the group and reinserts the group at its old index. */
  undo(): void {
    if (!this.executed) {
      return;
    }
    this.childrenRestoreIntoGroup();
    this.groupReinsertAtOriginalSlot();
    this.executed = false;
  }

  /**
   * Returns the group object associated with this command.
   *
   * @returns The Three.js Group being ungrouped.
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Detaches every child from the group without parenting them elsewhere yet.
   *
   * @returns Detached children in former sibling order.
   */
  private groupChildrenDetach(): THREE.Object3D[] {
    const children = this.group.children.slice();
    for (const child of children) {
      this.group.remove(child);
    }
    return children;
  }

  /** Removes the group from its parent when it still has one. */
  private groupDetachFromParent(): void {
    if (!this.group.parent) {
      return;
    }
    this.group.parent.remove(this.group);
  }

  /**
   * Inserts ungrouped children into the original parent at the group's former
   * sibling index so order matches the outliner position of the dissolved
   * group.
   *
   * @param children Detached former group children in order.
   */
  private childrenInsertAtGroupSlot(children: readonly THREE.Object3D[]): void {
    if (!this.originalParent) {
      return;
    }
    let insertIndex = this.groupSiblingIndex;
    for (const child of children) {
      this.childInsertAtIndex(this.originalParent, child, insertIndex);
      insertIndex += 1;
    }
  }

  /**
   * Inserts one child at a sibling index under a parent.
   *
   * @param parent Destination parent.
   * @param child Child to insert.
   * @param index Sibling index under parent.
   */
  private childInsertAtIndex(parent: THREE.Object3D, child: THREE.Object3D, index: number): void {
    const clamped = Math.max(0, Math.min(index, parent.children.length));
    parent.children.splice(clamped, 0, child);
    child.parent = parent;
  }

  /** Moves snapshot children back into the group for undo. */
  private childrenRestoreIntoGroup(): void {
    for (const snapshot of this.childSnapshots) {
      snapshot.child.parent?.remove(snapshot.child);
      this.group.add(snapshot.child);
    }
  }

  /** Reinserts the group under its original parent at the captured index. */
  private groupReinsertAtOriginalSlot(): void {
    if (!this.originalParent) {
      return;
    }
    this.childInsertAtIndex(this.originalParent, this.group, this.groupSiblingIndex);
  }

  /**
   * Builds snapshots for each child of the group.
   *
   * @param group The group whose children should be snapshotted.
   * @returns An array of child state snapshots.
   */
  private buildSnapshots(group: THREE.Group): UngroupChildSnapshot[] {
    const snapshots: UngroupChildSnapshot[] = [];
    for (const child of group.children) {
      snapshots.push({ child });
    }
    return snapshots;
  }
}
