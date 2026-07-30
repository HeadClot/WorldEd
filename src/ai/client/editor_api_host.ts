import type * as THREE from 'three';
import type { CommandStack } from '@/commands/command_stack.js';
import type { ManagerSelection } from '@/selection/object/manager_selection.js';
import type { ControllerSolidModel } from '@/solid/controller/controller_solid_model.js';
import type { GridSnap } from '@/transform/snap/grid_snap.js';
import type { ManagerSnap } from '@/transform/snap/manager_snap.js';

/**
 * Dependencies injected into EditorApi once at layout bootstrap. Keeps AI code
 * from reaching into layout managers directly.
 */
export interface EditorApiHost {
  worldObject: THREE.Group;
  commandStack: CommandStack;
  selectionManager: ManagerSelection;
  solidModelController: ControllerSolidModel;
  gridSnap: GridSnap;
  snapManager: ManagerSnap;
  getUserSnapEnabled: () => boolean;
  refreshAfterWorldMutation: () => void;
  refreshOutliner: () => void;
  showStatus: (message: string) => void;
}
