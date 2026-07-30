import * as THREE from 'three';
import { CommandObjectDelete, DeleteSnapshot } from '@/outliner/commands/command_object_delete.js';
import { CommandObjectDeleteHierarchy } from '@/outliner/commands/command_object_delete_hierarchy.js';
import { CommandObjectDuplicate } from '@/outliner/commands/command_object_duplicate.js';
import { CommandSolidDuplicateBrushes } from '@/solid/commands/command_solid_duplicate_brushes.js';
import { CommandSolidDeleteBrushes } from '@/solid/commands/command_solid_delete_brushes.js';
import { CommandObjectGroup } from '@/outliner/commands/command_object_group.js';
import { CommandObjectUngroup } from '@/outliner/commands/command_object_ungroup.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { collapseToHierarchyRoots, findCommonParent } from '@/utils/hierarchy_selection.js';
import { filterUnlockedObjects, isObjectOrAncestorLocked } from '@/utils/object_lock.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { findSolidModelRoot, isSolidCsgGroup, markAsSolidCsgGroup } from '@/solid/model/solid_group.js';

/** Callback invoked to sync scene state to all viewports. */
export type SyncViewportsCallback = () => void;

/** Callback invoked to refresh the outliner panel. */
export type RefreshOutlinerCallback = () => void;

/**
 * Callback invoked to show a status message.
 *
 * @param message The status message to display.
 */
export type StatusMessageCallback = (message: string) => void;

/**
 * Centralized handler for object-level actions: delete, duplicate, group,
 * ungroup. Coordinates command execution, viewport sync, outliner refresh, and
 * feedback.
 */
export class HandlerObjectAction {
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: ManagerSelection;
  private syncViewports: SyncViewportsCallback | null;
  private refreshOutliner: RefreshOutlinerCallback | null;
  private showStatusMessage: StatusMessageCallback | null;
  private groupCounter: number;

  /**
   * Creates a new object action handler.
   *
   * @param worldObject The root group containing scene objects.
   * @param commandStack The command stack for undo support.
   * @param selectionManager The selection manager.
   */
  constructor(worldObject: THREE.Group, commandStack: CommandStack, selectionManager: ManagerSelection) {
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.syncViewports = null;
    this.refreshOutliner = null;
    this.showStatusMessage = null;
    this.groupCounter = 0;
  }

  /**
   * Sets the callback for synchronizing viewports after actions.
   *
   * @param callback The synchronization function.
   */
  setSyncViewports(callback: SyncViewportsCallback): void {
    this.syncViewports = callback;
  }

  /**
   * Sets the callback for refreshing the outliner after actions.
   *
   * @param callback The outliner refresh function.
   */
  setRefreshOutliner(callback: RefreshOutlinerCallback): void {
    this.refreshOutliner = callback;
  }

  /**
   * Sets the callback for showing status bar messages.
   *
   * @param callback The status message function.
   */
  setShowStatusMessage(callback: StatusMessageCallback): void {
    this.showStatusMessage = callback;
  }

  /**
   * Handles deletion of selected meshes (viewport mesh selection). Solid
   * brushes are unregistered from their solid model so CSG drops them.
   */
  onDeleteSelected(): void {
    const selected = this.selectionManager.getSelectedObjects();
    if (selected.size === 0) return;
    const toRemove = filterUnlockedObjects(Array.from(selected));
    if (toRemove.length === 0) {
      this.showMessage('Cannot delete locked object(s)');
      return;
    }
    this.deleteMeshesWithSolidSupport(toRemove);
  }

  /**
   * Deletes hierarchy roots (meshes, groups, empty groups) from the scene.
   * Solid brushes are removed from their solid model CSG tree, not only the
   * scene.
   *
   * @param objects Hierarchy nodes to remove.
   */
  deleteHierarchyObjects(objects: THREE.Object3D[]): void {
    const roots = filterUnlockedObjects(
      collapseToHierarchyRoots(objects).filter((object) => object !== this.worldObject),
    );
    if (roots.length === 0) {
      this.showMessage('Cannot delete locked object(s)');
      return;
    }
    const solidBrushes: THREE.Mesh[] = [];
    const otherRoots: THREE.Object3D[] = [];
    for (const root of roots) {
      if (root instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(root)) {
        solidBrushes.push(root);
        continue;
      }
      otherRoots.push(root);
    }
    if (solidBrushes.length > 0) {
      this.commandStack.push(new CommandSolidDeleteBrushes(solidBrushes));
    }
    if (otherRoots.length > 0) {
      this.commandStack.push(new CommandObjectDeleteHierarchy(otherRoots));
    }
    this.selectionManager.clearSelection();
    this.notifySyncAndRefresh();
    this.showMessage(`Deleted ${roots.length} object(s)`);
  }

  /**
   * Deletes meshes, routing solid brushes through solid-model removal.
   *
   * @param meshes Meshes to delete.
   */
  private deleteMeshesWithSolidSupport(meshes: THREE.Mesh[]): void {
    const solidBrushes = CommandSolidDeleteBrushes.filterBrushMeshes(meshes);
    const regularMeshes = meshes.filter((mesh) => !SolidBrushVisual.isBrushObject(mesh));
    if (solidBrushes.length > 0) {
      this.commandStack.push(new CommandSolidDeleteBrushes(solidBrushes));
    }
    if (regularMeshes.length > 0) {
      const snapshots = this.buildDeleteSnapshots(regularMeshes);
      this.commandStack.push(new CommandObjectDelete(snapshots));
    }
    this.selectionManager.clearSelection();
    this.notifySyncAndRefresh();
  }

  /**
   * Handles duplication of selected objects. Prefers inspector hierarchy roots
   * (groups and brushes) so solid CSG groups duplicate as whole subtrees.
   */
  onDuplicateSelected(): void {
    const inspectorObjects = this.selectionManager.getInspectorObjects();
    if (inspectorObjects.length > 0) {
      this.duplicateHierarchyObjects(inspectorObjects);
      return;
    }
    const selected = this.selectionManager.getSelectedObjects();
    if (selected.size === 0) return;
    this.duplicateHierarchyObjects(Array.from(selected));
  }

  /**
   * Duplicates hierarchy roots: solid CSG groups, solid brushes, and regular
   * meshes. Nested selection collapses to outermost roots first.
   *
   * @param objects Selected hierarchy nodes.
   */
  duplicateHierarchyObjects(objects: THREE.Object3D[]): void {
    const roots = filterUnlockedObjects(
      collapseToHierarchyRoots(objects).filter((object) => object !== this.worldObject),
    );
    if (roots.length === 0) {
      this.showMessage('Cannot duplicate locked object(s)');
      return;
    }
    const solidNodes: THREE.Object3D[] = [];
    const regularMeshes: THREE.Mesh[] = [];
    for (const root of roots) {
      if (isSolidCsgGroup(root)) {
        solidNodes.push(root);
        continue;
      }
      if (root instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(root)) {
        solidNodes.push(root);
        continue;
      }
      if (root instanceof THREE.Mesh) {
        regularMeshes.push(root);
      }
    }
    const clonedMeshes: THREE.Mesh[] = [];
    const clonedInspector: THREE.Object3D[] = [];
    if (solidNodes.length > 0) {
      const solidCommand = new CommandSolidDuplicateBrushes(solidNodes, new THREE.Vector3(0, 0, 0));
      this.commandStack.push(solidCommand);
      clonedMeshes.push(...solidCommand.getClonedMeshes());
      clonedInspector.push(...solidCommand.getClonedInspectorRoots());
    }
    if (regularMeshes.length > 0) {
      const regularCommand = new CommandObjectDuplicate(regularMeshes, this.worldObject, new THREE.Vector3(0, 0, 0));
      this.commandStack.push(regularCommand);
      clonedMeshes.push(...regularCommand.getClonedMeshes());
      clonedInspector.push(...regularCommand.getClonedMeshes());
    }
    this.syncViewportsAndRefresh();
    if (clonedMeshes.length > 0 || clonedInspector.length > 0) {
      this.selectionManager.setSelection(clonedMeshes, clonedInspector);
    }
    this.showDuplicateFeedback(Math.max(clonedInspector.length, clonedMeshes.length));
    this.notifyRefresh();
  }

  /** Handles grouping of selected objects. */
  onGroupSelected(): void {
    const selected = this.selectionManager.getSelectedObjects();
    if (selected.size === 0) return;
    const objects = this.buildGroupObjectsFromSelection();
    if (objects.length === 0) {
      this.showMessage('Cannot group locked object(s)');
      return;
    }
    this.executeGroup(objects);
  }

  /**
   * Groups a specific set of objects together. Used by the outliner context
   * menu to group user-selected items.
   *
   * @param objects The objects to group together.
   */
  groupObjects(objects: THREE.Object3D[]): void {
    const unlocked = filterUnlockedObjects(objects);
    if (unlocked.length === 0) {
      this.showMessage('Cannot group locked object(s)');
      return;
    }
    this.executeGroup(unlocked);
  }

  /** Handles ungrouping of the selected object's parent group. */
  onUngroupSelected(): void {
    const firstSelected = this.selectionManager.getFirstSelectedObject();
    if (!firstSelected) return;
    const groupTarget = this.findGroupTarget(firstSelected);
    if (!groupTarget) return;
    this.ungroupGroup(groupTarget);
  }

  /**
   * Ungroups a specific group. Used by the outliner context menu to ungroup a
   * specific group. Rebuilds solid models when the group was under a solid CSG
   * tree.
   *
   * @param group The group to ungroup.
   */
  ungroupGroup(group: THREE.Group): void {
    if (isObjectOrAncestorLocked(group)) {
      this.showMessage('Cannot ungroup locked group');
      return;
    }
    const command = new CommandObjectUngroup(group);
    this.commandStack.push(command);
    SolidModel.rebuildAllUnder(this.worldObject);
    this.notifySyncAndRefresh();
  }

  /**
   * Builds delete snapshots for all meshes to be deleted.
   *
   * @param meshes The meshes that are about to be deleted.
   * @returns An array of delete snapshots capturing full state.
   */
  private buildDeleteSnapshots(meshes: THREE.Mesh[]): DeleteSnapshot[] {
    const snapshots: DeleteSnapshot[] = [];
    meshes.forEach((mesh) => {
      const snapshot: DeleteSnapshot = {
        mesh: mesh,
        parent: mesh.parent,
        siblingIndex: mesh.parent ? mesh.parent.children.indexOf(mesh) : 0,
        position: mesh.position.clone(),
        rotation: mesh.quaternion.clone(),
        scale: mesh.scale.clone(),
        name: mesh.name,
        geometry: mesh.geometry.clone(),
        material: (mesh.material as THREE.Material).clone(),
      };
      snapshots.push(snapshot);
    });
    return snapshots;
  }

  /**
   * Builds the array of objects to group from the current selection. Uses
   * selected meshes as hierarchy nodes when no outliner override is supplied.
   *
   * @returns An array of objects to include in the group.
   */
  private buildGroupObjectsFromSelection(): THREE.Object3D[] {
    return filterUnlockedObjects(this.selectionManager.getAllSelectedObjectsAsArray());
  }

  /**
   * Executes the group command and triggers post-action notifications. New
   * group is parented under the common parent of the members so nesting builds
   * a tree instead of always dumping into the world root. Groups created under
   * a solid model become solid CSG compounds so hierarchical operations work.
   *
   * @param objects The objects to group together.
   */
  private executeGroup(objects: THREE.Object3D[]): void {
    const members = collapseToHierarchyRoots(objects);
    if (members.length === 0) return;
    if (!this.canGroupSolidMembers(members)) {
      this.showMessage('Solid brushes must stay under their solid model');
      return;
    }
    this.groupCounter++;
    const groupName = this.buildGroupName();
    const parent = findCommonParent(members, this.worldObject);
    const command = new CommandObjectGroup(members, parent, groupName);
    this.commandStack.push(command);
    this.finalizeSolidGroupIfNeeded(command.getGroup(), members);
    SolidModel.rebuildAllUnder(this.worldObject);
    this.notifySyncAndRefresh();
    this.showGroupFeedback(groupName);
  }

  /**
   * Returns whether solid members share a valid common solid parent for
   * grouping. Non-solid members always pass.
   *
   * @param members Hierarchy roots to group.
   * @returns False when solid brushes would leave their solid model.
   */
  private canGroupSolidMembers(members: THREE.Object3D[]): boolean {
    const solidRoots = new Set<THREE.Object3D>();
    for (const member of members) {
      const solidRoot = findSolidModelRoot(member);
      if (solidRoot) solidRoots.add(solidRoot);
      if (SolidBrushVisual.isBrushObject(member) && !solidRoot) return false;
    }
    if (solidRoots.size === 0) return true;
    if (solidRoots.size > 1) return false;
    const solidRoot = solidRoots.values().next().value as THREE.Object3D;
    for (const member of members) {
      if (!findSolidModelRoot(member) && member !== solidRoot) return false;
    }
    return true;
  }

  /**
   * Marks a newly created group as a solid CSG compound when it lives under a
   * solid model.
   *
   * @param group Group created by CommandObjectGroup.
   * @param members Grouped members used to detect solid ownership.
   */
  private finalizeSolidGroupIfNeeded(group: THREE.Group, members: THREE.Object3D[]): void {
    const solidRoot = findSolidModelRoot(group) ?? members.map(findSolidModelRoot).find((root) => root !== null);
    if (!solidRoot) return;
    markAsSolidCsgGroup(group);
  }

  /**
   * Finds the group target for ungrouping from a selected mesh.
   *
   * @param mesh The selected mesh to find a group for.
   * @returns The group to ungroup, or null if none found.
   */
  private findGroupTarget(mesh: THREE.Mesh): THREE.Group | null {
    const parent = mesh.parent;
    if (parent instanceof THREE.Group && parent !== this.worldObject) {
      return parent;
    }
    return null;
  }

  /**
   * Shows a feedback message in the status bar for duplication.
   *
   * @param count The number of objects that were duplicated.
   */
  private showDuplicateFeedback(count: number): void {
    this.showMessage(`Duplicated ${count} object(s)`);
  }

  /**
   * Shows a feedback message in the status bar for grouping.
   *
   * @param groupName The name of the newly created group.
   */
  private showGroupFeedback(groupName: string): void {
    this.showMessage(`Created group: ${groupName}`);
  }

  /**
   * Builds the next group name using the internal counter.
   *
   * @returns A formatted group name string.
   */
  private buildGroupName(): string {
    return `Group${String(this.groupCounter + 1).padStart(3, '0')}`;
  }

  /**
   * Displays a message via the registered status callback.
   *
   * @param message The message to display.
   */
  private showMessage(message: string): void {
    if (this.showStatusMessage) {
      this.showStatusMessage(message);
    }
  }

  /** Triggers viewport sync and outliner refresh in sequence. */
  private notifySyncAndRefresh(): void {
    this.syncViewportsAndRefresh();
    this.notifyRefresh();
  }

  /** Triggers viewport synchronization if registered. */
  private syncViewportsAndRefresh(): void {
    if (this.syncViewports) {
      this.syncViewports();
    }
  }

  /** Triggers outliner refresh if registered. */
  private notifyRefresh(): void {
    if (this.refreshOutliner) {
      this.refreshOutliner();
    }
  }
}
