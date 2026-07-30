import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';

/**
 * Snapshot capturing the state of each child before grouping. Stores parent
 * reference and sibling index for undo restoration.
 */
export interface GroupChildSnapshot {
  /** The child object being grouped. */
  child: THREE.Object3D;

  /** The original parent of the child before grouping. */
  originalParent: THREE.Object3D | null;

  /** The sibling index of the child within its original parent. */
  siblingIndex: number;
}

/**
 * Undoable command for grouping selected objects under a new parent group.
 * Execute creates the group and reparents children; undo restores original
 * parents.
 */
export class CommandObjectGroup implements UndoCommand {
  private group: THREE.Group;
  private newParent: THREE.Object3D;
  private childSnapshots: GroupChildSnapshot[];
  private executed: boolean;

  /**
   * Creates a new group command for selected objects.
   *
   * @param objects The objects to group together.
   * @param parent The parent object to add the new group under.
   * @param groupName The name for the new group container.
   */
  constructor(objects: THREE.Object3D[], parent: THREE.Object3D, groupName: string) {
    this.group = new THREE.Group();
    this.group.name = groupName;
    this.newParent = parent;
    this.childSnapshots = this.buildSnapshots(objects);
    this.executed = false;
  }

  /**
   * Executes the group by adding children to the group and placing it under the
   * parent at the earliest original sibling index (so CSG order and outliner
   * position match the right-clicked / selected nodes instead of appending).
   */
  execute(): void {
    if (this.executed) return;
    const insertIndex = this.computeGroupInsertIndex();
    this.childSnapshots.forEach((snapshot) => {
      snapshot.child.parent?.remove(snapshot.child);
      this.group.add(snapshot.child);
    });
    this.newParent.add(this.group);
    this.moveChildToIndex(this.newParent, this.group, insertIndex);
    this.executed = true;
  }

  /** Undoes the group by reparenting children to their original parents. */
  undo(): void {
    if (!this.executed) return;
    this.childSnapshots.forEach((snapshot) => {
      if (snapshot.child.parent) {
        snapshot.child.parent.remove(snapshot.child);
      }
      if (snapshot.originalParent) {
        snapshot.originalParent.add(snapshot.child);
        const currentIndex = snapshot.originalParent.children.indexOf(snapshot.child);
        if (currentIndex > snapshot.siblingIndex) {
          snapshot.originalParent.children.splice(currentIndex, 1);
          snapshot.originalParent.children.splice(snapshot.siblingIndex, 0, snapshot.child);
          snapshot.child.parent = snapshot.originalParent;
        }
      }
    });
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    this.executed = false;
  }

  /**
   * Returns the group object created by this command.
   *
   * @returns The Three.js Group containing the grouped children.
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Builds snapshots capturing each child's original parent and position.
   *
   * @param objects The objects to snapshot.
   * @returns An array of child state snapshots.
   */
  private buildSnapshots(objects: THREE.Object3D[]): GroupChildSnapshot[] {
    const snapshots: GroupChildSnapshot[] = [];
    objects.forEach((child) => {
      const snapshot: GroupChildSnapshot = {
        child: child,
        originalParent: child.parent,
        siblingIndex: child.parent ? child.parent.children.indexOf(child) : 0,
      };
      snapshots.push(snapshot);
    });
    return snapshots;
  }

  /**
   * Computes where the new group should sit under {@code newParent}: the
   * minimum original sibling index among members that already lived there.
   * Falls back to append when no member was under the target parent.
   *
   * @returns Sibling index for the new group under the target parent.
   */
  private computeGroupInsertIndex(): number {
    let minIndex: number | null = null;
    for (const snapshot of this.childSnapshots) {
      if (snapshot.originalParent !== this.newParent) continue;
      if (minIndex === null || snapshot.siblingIndex < minIndex) {
        minIndex = snapshot.siblingIndex;
      }
    }
    if (minIndex === null) return this.newParent.children.length;
    return Math.max(0, Math.min(minIndex, this.newParent.children.length));
  }

  /**
   * Moves a child to a specific index within a parent.
   *
   * @param parent The parent whose children array is reordered.
   * @param child The child to move.
   * @param index The destination index.
   */
  private moveChildToIndex(parent: THREE.Object3D, child: THREE.Object3D, index: number): void {
    const currentIndex = parent.children.indexOf(child);
    if (currentIndex < 0) return;
    parent.children.splice(currentIndex, 1);
    const clamped = Math.max(0, Math.min(index, parent.children.length));
    parent.children.splice(clamped, 0, child);
  }
}
