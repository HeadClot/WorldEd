import type * as THREE from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';

/** Edge shared by two face planes used when finding triple intersections. */
export interface SolidAlgorithmPlanePair {
  /** First face plane of the edge. */
  plane0: SolidPlane;
  /** Second face plane of the edge. */
  plane1: SolidPlane;
  /** First edge endpoint as homogeneous point (w = 1). */
  edgeVertex0: THREE.Vector3;
  /** Second edge endpoint as homogeneous point (w = 1). */
  edgeVertex1: THREE.Vector3;
  /** Face index of plane0. */
  planeIndex0: number;
  /** Face index of plane1. */
  planeIndex1: number;
}
