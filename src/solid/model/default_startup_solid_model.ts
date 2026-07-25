import { SolidOperation } from '../types/solid_operation.js';
import { SolidModel } from './solid_model.js';

/** Edge length of the single brush seeded into a new editor session. */
export const DEFAULT_STARTUP_BRUSH_SIZE = 1;

/**
 * Builds the solid model placed in an empty editor scene: one additive unit box
 * centered at the world origin. The model root and brush stay at 0,0,0.
 *
 * @returns Fully rebuilt solid model (not yet parented into the world).
 */
export function createDefaultStartupSolidModel(): SolidModel {
  const model = new SolidModel('DefaultModel');
  model.addBoxBrush(DEFAULT_STARTUP_BRUSH_SIZE, SolidOperation.Additive);
  model.root.position.set(0, 0, 0);
  model.root.updateMatrixWorld(true);
  return model;
}
