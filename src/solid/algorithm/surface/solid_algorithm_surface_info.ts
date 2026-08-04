import { SurfaceCategory } from '@/solid/types/surface_category.js';

/** Per-surface metadata for base and intersection loops on a brush face. */
export interface SolidAlgorithmSurfaceInfo {
  /** Prepared brush index that owns this surface loop. */
  brushIndex: number;
  /** Face / base plane index on that brush. */
  basePlaneIndex: number;
  /** Interior category byte (SurfaceCategory). */
  interiorCategory: number;
}

/**
 * Builds a default surface info for a base polygon (interiorCategory Inside).
 *
 * @param brushIndex Prepared brush index.
 * @param basePlaneIndex Face index.
 * @returns Surface info with Inside interior category.
 */
export function solidAlgorithmSurfaceInfoBase(brushIndex: number, basePlaneIndex: number): SolidAlgorithmSurfaceInfo {
  return {
    brushIndex,
    basePlaneIndex,
    interiorCategory: SurfaceCategory.Inside,
  };
}
