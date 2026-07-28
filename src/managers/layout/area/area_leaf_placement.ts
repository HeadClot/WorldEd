import type { AreaLeafPayload } from './area_editor_type.js';
import type { AreaRect } from './area_rect.js';

/** A leaf with its computed normalized rectangle. */
export interface AreaLeafPlacement {
  payload: AreaLeafPayload;
  rect: AreaRect;
}

/**
 * Creates a leaf placement record.
 *
 * @param payload Leaf payload.
 * @param rect Normalized rect.
 * @returns Placement record.
 */
export function createLeafPlacement(payload: AreaLeafPayload, rect: AreaRect): AreaLeafPlacement {
  return { payload, rect };
}
