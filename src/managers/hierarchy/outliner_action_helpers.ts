import * as THREE from 'three';
import { CommandStack } from '../../commands/command_stack.js';
import { RenameCommand } from '../../commands/object/rename_command.js';
import { ToggleVisibilityCommand } from '../../commands/object/toggle_visibility_command.js';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { isObjectOrAncestorLocked, toggleObjectLocked } from '../../utils/object_lock.js';
import { ObjectActionHandler } from './object_action_handler.js';

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
  commandStack.push(new RenameCommand(obj, newName));
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
  commandStack.push(new ToggleVisibilityCommand(obj));
  refreshOutliner();
  syncViewports?.();
}

/**
 * Handles Duplicate from the outliner context menu.
 *
 * @param obj Hierarchy object to duplicate.
 * @param selectionManager Selection manager.
 * @param objectActionHandler Object action handler.
 */
export function handleOutlinerDuplicate(
  obj: THREE.Object3D,
  selectionManager: SelectionManager,
  objectActionHandler: ObjectActionHandler,
): void {
  if (obj instanceof THREE.Mesh) {
    selectionManager.selectObject(obj);
    objectActionHandler.onDuplicateSelected();
  }
}
