import type * as THREE from 'three';
import type { SolidAlgorithmSurfaceInfo } from './solid_algorithm_surface_info.js';

/** Bounded intersection loop on a subject face from pair intersection loops. */
export interface SolidAlgorithmSurfaceLoop {
  /** Prepared index of the brush that owns the base face. */
  subjectBrushIndex: number;
  /** Prepared index of the peer brush. */
  peerBrushIndex: number;
  /** Face index / base plane index on the subject brush. */
  basePlaneIndex: number;
  /** Interior category from pair alignment. */
  interiorCategory: number;
  /**
   * Ordered loop vertices in model space (closed ring, first vertex not
   * repeated).
   */
  loopVertices: THREE.Vector3[];
}

/**
 * Builds a surface loop record.
 *
 * @param subjectBrushIndex Subject prepared index.
 * @param peerBrushIndex Peer prepared index.
 * @param surfaceInfo Surface metadata for the base plane.
 * @param loopVertices Ordered loop vertices.
 * @returns Surface loop.
 */
export function solidAlgorithmSurfaceLoopCreate(
  subjectBrushIndex: number,
  peerBrushIndex: number,
  surfaceInfo: SolidAlgorithmSurfaceInfo,
  loopVertices: THREE.Vector3[],
): SolidAlgorithmSurfaceLoop {
  return {
    subjectBrushIndex,
    peerBrushIndex,
    basePlaneIndex: surfaceInfo.basePlaneIndex,
    interiorCategory: surfaceInfo.interiorCategory,
    loopVertices,
  };
}
