import type * as THREE from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { SolidAlgorithmPlanePair } from './solid_algorithm_plane_pair.js';
import type { SolidAlgorithmSurfaceInfo } from './solid_algorithm_surface_info.js';

/**
 * One side of a prepared brush pair for CreateIntersectionLoops. All geometry
 * is in model / tree space.
 */
export interface SolidAlgorithmBrushPairIntersectionInfo {
  /** Prepared brush index for this side. */
  brushIndex: number;
  /** Vertices that participate in the intersection. */
  usedVertices: THREE.Vector3[];
  /** Plane pairs (edges) that participate in the intersection. */
  usedPlanePairs: SolidAlgorithmPlanePair[];
  /**
   * Local planes for this brush (indices that may cut the other). Length is
   * intersectingPlanesAndEdges (face planes only in our port).
   */
  localSpacePlanes: SolidPlane[];
  /** Number of face planes in localSpacePlanes. */
  localSpacePlanesLength: number;
  /** Original face indices for each entry in localSpacePlanes. */
  localSpacePlaneIndices: number[];
  /** Flat list of face plane indices that each used vertex lies on. */
  vertexIntersectionPlanes: number[];
  /** Per used-vertex (offset, length) into vertexIntersectionPlanes. */
  vertexIntersectionSegments: Array<{ offset: number; length: number }>;
  /** Per face-plane surface info (aligned categories). */
  surfaceInfos: SolidAlgorithmSurfaceInfo[];
}

/** Full prepared pair for CreateIntersectionLoops. */
export interface SolidAlgorithmBrushPairIntersection {
  /** Intersection type for the pair. */
  type: import('@/solid/algorithm/routing/solid_algorithm_intersection_type.js').SolidAlgorithmIntersectionType;
  /** First brush side (subject-local order depends on pair construction). */
  brush0: SolidAlgorithmBrushPairIntersectionInfo;
  /** Second brush side. */
  brush1: SolidAlgorithmBrushPairIntersectionInfo;
}
