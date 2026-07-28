import type * as THREE from 'three';
import type { CadLocalAxis } from './cad_view_plane.js';

/** One world-space line segment with solid start/end colors. */
export interface CadLineSegment {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  colorA: THREE.Color;
  colorB: THREE.Color;
  /**
   * When true, stroke uses screen-pixel dashing (blue size-dimension wings).
   * Gray extension legs stay solid so they remain readable on dark viewports.
   */
  dashed?: boolean;
}

/** Screen-projected label specification in world space. */
export interface CadLabelSpec {
  id: string;
  worldPosition: THREE.Vector3;
  text: string;
  colorCss: string;
}

/** Local principal axis index on an oriented bounds box (0=X, 1=Y-up, 2=Z). */
export type LocalAxisIndex = CadLocalAxis;
