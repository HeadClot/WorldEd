import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { CommandObjectRename } from '@/outliner/commands/command_object_rename.js';
import { CommandObjectToggleVisibility } from '@/outliner/commands/command_object_toggle_visibility.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { isObjectOrAncestorLocked, toggleObjectLocked } from '@/utils/object_lock.js';
import { HandlerObjectAction } from './handler_object_action.js';

/**
 * Applies outliner rename via command stack.
 *
 * @param commandStack Undo stack.
 * @param obj Object to rename.
 * @param newName Requested name.
 * @param refreshOutliner Callback after rename.
 */
export function applyOutlinerRename(
  commandStack: CommandStack,
  obj: THREE.Object3D,
  newName: string,
  refreshOutliner: () => void,
): void {
  if (newName.trim().length === 0) return;
  if (isObjectOrAncestorLocked(obj)) return;
  commandStack.push(new CommandObjectRename(obj, newName));
  refreshOutliner();
}

/**
 * Toggles outliner lock state on an object and refreshes the tree.
 *
 * @param obj Object whose lock flag toggles.
 * @param refreshOutliner Callback after toggle.
 * @param showStatusMessage Optional status feedback.
 * @returns True when the object is now locked.
 */
export function applyOutlinerLockToggle(
  obj: THREE.Object3D,
  refreshOutliner: () => void,
  showStatusMessage?: (message: string) => void,
): boolean {
  const locked = toggleObjectLocked(obj);
  refreshOutliner();
  if (showStatusMessage) {
    const label = obj.name || 'Object';
    showStatusMessage(locked ? `Locked ${label}` : `Unlocked ${label}`);
  }
  return locked;
}

/**
 * Applies outliner visibility toggle via command stack. Solid brushes also
 * leave/re-enter CSG evaluation inside the command.
 *
 * @param commandStack Undo stack.
 * @param obj Object whose visibility toggles.
 * @param refreshOutliner Callback after toggle.
 * @param syncViewports Optional viewport refresh after solid CSG changes.
 */
export function applyOutlinerVisibilityToggle(
  commandStack: CommandStack,
  obj: THREE.Object3D,
  refreshOutliner: () => void,
  syncViewports?: () => void,
): void {
  commandStack.push(new CommandObjectToggleVisibility(obj));
  refreshOutliner();
  syncViewports?.();
}

/**
 * Handles Duplicate from the outliner context menu. Duplicates the current
 * hierarchy multi-selection when the right-clicked object is part of it;
 * otherwise duplicates only the right-clicked node (mesh or group).
 *
 * @param obj Hierarchy object to duplicate.
 * @param selectionManager Selection manager.
 * @param objectActionHandler Object action handler.
 */
export function handleOutlinerDuplicate(
  obj: THREE.Object3D,
  selectionManager: ManagerSelection,
  objectActionHandler: HandlerObjectAction,
): void {
  const inspectorObjects = selectionManager.getInspectorObjects();
  if (inspectorObjects.includes(obj) && inspectorObjects.length > 0) {
    objectActionHandler.duplicateHierarchyObjects(inspectorObjects);
    return;
  }
  objectActionHandler.duplicateHierarchyObjects([obj]);
}
