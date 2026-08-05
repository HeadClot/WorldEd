import { ObjectApplyTransformKind } from '@/types/object_apply_transform_kind.js';

/** Which local TRS channels to bake into geometry. */
export interface ObjectApplyTransformFlags {
  location: boolean;
  rotation: boolean;
  scale: boolean;
}

/**
 * Maps an apply kind to location/rotation/scale bake flags.
 *
 * @param kind Apply menu kind.
 * @returns Channel flags.
 */
export function objectApplyTransformFlagsFromKind(kind: ObjectApplyTransformKind): ObjectApplyTransformFlags {
  if (kind === ObjectApplyTransformKind.LOCATION) {
    return { location: true, rotation: false, scale: false };
  }
  if (kind === ObjectApplyTransformKind.ROTATION) {
    return { location: false, rotation: true, scale: false };
  }
  if (kind === ObjectApplyTransformKind.SCALE) {
    return { location: false, rotation: false, scale: true };
  }
  if (kind === ObjectApplyTransformKind.ROTATION_AND_SCALE) {
    return { location: false, rotation: true, scale: true };
  }
  return { location: true, rotation: true, scale: true };
}
