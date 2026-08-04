import type * as THREE from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';

/** Outside-planes test for CreateIntersectionLoops. */
export class SolidAlgorithmCreateIntersectionLoopsOutside {
  /**
   * Returns true when the vertex is strictly outside any of the planes.
   *
   * @param planes Plane list.
   * @param planesLength Number of planes to test (may be less than
   *   planes.length).
   * @param vertex Point to test.
   * @param epsilon Fat-plane width.
   * @returns True when outside.
   */
  static isOutsidePlanes(
    planes: readonly SolidPlane[],
    planesLength: number,
    vertex: THREE.Vector3,
    epsilon: number = SOLID_FAT_PLANE_EPSILON,
  ): boolean {
    let planeIndex = 0;
    while (planeIndex + 4 < planesLength) {
      if (this.anyOfFourOutside(planes, planeIndex, vertex, epsilon)) {
        return true;
      }
      planeIndex += 4;
    }
    for (; planeIndex < planesLength; planeIndex++) {
      const plane = planes[planeIndex];
      if (!plane) {
        continue;
      }
      const distance = plane.signedDistance(vertex);
      if (!(distance <= epsilon)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Tests four consecutive planes for any outside distance.
   *
   * @param planes Plane list.
   * @param start Start index.
   * @param vertex Point.
   * @param epsilon Fat-plane width.
   * @returns True when any of the four rejects the point.
   */
  private static anyOfFourOutside(
    planes: readonly SolidPlane[],
    start: number,
    vertex: THREE.Vector3,
    epsilon: number,
  ): boolean {
    for (let offset = 0; offset < 4; offset++) {
      const plane = planes[start + offset];
      if (!plane) {
        continue;
      }
      const distance = plane.signedDistance(vertex);
      if (!(distance <= epsilon)) {
        return true;
      }
    }
    return false;
  }
}
