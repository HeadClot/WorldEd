import { SolidOperation } from '@/solid/types/solid_operation.js';
import { hierarchyNameAllocator } from '@/utils/utils_hierarchy_name_allocator.js';
import { SolidModel } from './solid_model.js';

/** Edge length of the single brush seeded into a new editor session. */
export const SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE = 1;

/**
 * Builds the solid model placed in an empty editor scene: one additive unit box
 * centered at the world origin. The model root and brush stay at 0,0,0.
 *
 * @returns Fully rebuilt solid model (not yet parented into the world).
 */
export function createSolidModelStartupDefault(): SolidModel {
  const model = new SolidModel(hierarchyNameAllocator.allocate('DefaultModel'));
  model.addBoxBrush(SOLID_MODEL_STARTUP_DEFAULT_BRUSH_SIZE, SolidOperation.Additive);
  model.root.position.set(0, 0, 0);
  model.root.updateMatrixWorld(true);
  return model;
}
