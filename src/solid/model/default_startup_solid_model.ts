import { DEFAULT_CUBE_CENTER_Y } from '../../types/editor_config.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SolidModel } from './solid_model.js';

/** Edge length of the single brush seeded into a new editor session. */
export const DEFAULT_STARTUP_BRUSH_SIZE = 1;

/**
 * Builds the solid model placed in an empty editor scene: one additive unit box
 * sitting on the ground plane (same footprint as the former default cube).
 *
 * The brush is created centered at the origin (Y -0.5…0.5). The model root is
 * then lifted by DEFAULT_CUBE_CENTER_Y so world bounds become Y 0…1 and the
 * geometric center matches getDefaultSceneFocus().
 *
 * @returns Fully rebuilt solid model (not yet parented into the world).
 */
export function createDefaultStartupSolidModel(): SolidModel {
  const model = new SolidModel('DefaultModel');
  model.addBoxBrush(DEFAULT_STARTUP_BRUSH_SIZE, SolidOperation.Additive);
  liftStartupModelOntoGround(model);
  return model;
}

/**
 * Raises the solid model root so a unit-centered brush sits on the ground.
 *
 * @param model Solid model whose root should be lifted.
 */
function liftStartupModelOntoGround(model: SolidModel): void {
  model.root.position.set(0, DEFAULT_CUBE_CENTER_Y, 0);
  model.root.updateMatrixWorld(true);
}
