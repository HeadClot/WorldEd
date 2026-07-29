import type * as THREE from 'three';
import type { CommandStack } from '../../commands/command_stack.js';
import type { SelectionManager } from '../../selection/object/selection_manager.js';
import type { SolidModelController } from '../../managers/solid/solid_model_controller.js';
import type { GridSnap } from '../../transform/snap/grid_snap.js';
import type { SnapManager } from '../../transform/snap/snap_manager.js';

/**
 * Dependencies injected into EditorApi once at layout bootstrap. Keeps AI code
 * from reaching into layout managers directly.
 */
export interface EditorApiHost {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: SelectionManager;
  solidModelController: SolidModelController;
  gridSnap: GridSnap;
  snapManager: SnapManager;
  getUserSnapEnabled: () => boolean;
  refreshAfterWorldMutation: () => void;
  refreshOutliner: () => void;
  showStatus: (message: string) => void;
}
