import * as THREE from 'three';
import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SOLID_DIVIDE_MINIMUM_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';

/**
 * Triple-plane intersection matching PlaneExtensions.Intersection (float4 plane
 * form ax+by+cz+d = 0).
 */
export class SolidAlgorithmPlaneTripleIntersection {
  /**
   * Intersects three planes and returns the unique point when it exists.
   *
   * @param plane1 First plane.
   * @param plane2 Second plane.
   * @param plane3 Third plane.
   * @returns Intersection point, or null when parallel / degenerate.
   */
  static intersect(plane1: SolidPlane, plane2: SolidPlane, plane3: SolidPlane): THREE.Vector3 | null {
    return this.intersectComponents(
      plane1.normal.x,
      plane1.normal.y,
      plane1.normal.z,
      plane1.offset,
      plane2.normal.x,
      plane2.normal.y,
      plane2.normal.z,
      plane2.offset,
      plane3.normal.x,
      plane3.normal.y,
      plane3.normal.z,
      plane3.offset,
    );
  }

  /**
   * Intersects three planes given as (nx, ny, nz, d) components.
   *
   * @param a1 Plane1 nx.
   * @param b1 Plane1 ny.
   * @param c1 Plane1 nz.
   * @param d1 Plane1 d.
   * @param a2 Plane2 nx.
   * @param b2 Plane2 ny.
   * @param c2 Plane2 nz.
   * @param d2 Plane2 d.
   * @param a3 Plane3 nx.
   * @param b3 Plane3 ny.
   * @param c3 Plane3 nz.
   * @param d3 Plane3 d.
   * @returns Intersection or null.
   */
  static intersectComponents(
    a1: number,
    b1: number,
    c1: number,
    d1: number,
    a2: number,
    b2: number,
    c2: number,
    d2: number,
    a3: number,
    b3: number,
    c3: number,
    d3: number,
  ): THREE.Vector3 | null {
    const n0 = this.buildN0(a2, b2, c2, d2, a3, b3, c3, d3);
    const nx = this.buildNx(a2, b2, c2, d2, a3, b3, c3, d3);
    const e = this.buildE(a1, b1, c1, d1, n0, nx);
    if (!Number.isFinite(e.y) || Math.abs(e.y) < SOLID_DIVIDE_MINIMUM_EPSILON) {
      return null;
    }
    const x = e.z / e.y;
    const y = e.w / e.y;
    const z = e.x / e.y;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    return new THREE.Vector3(x, y, z);
  }

  /**
   * Builds N0 = plane2.wzyx * plane3.yxwz - plane2.yxwz * plane3.wzyx.
   *
   * @param a2 Plane2 components.
   * @param b2 Plane2 ny.
   * @param c2 Plane2 nz.
   * @param d2 Plane2 d.
   * @param a3 Plane3 nx.
   * @param b3 Plane3 ny.
   * @param c3 Plane3 nz.
   * @param d3 Plane3 d.
   * @returns N0 as {x,y,z,w}.
   */
  private static buildN0(
    a2: number,
    b2: number,
    c2: number,
    d2: number,
    a3: number,
    b3: number,
    c3: number,
    d3: number,
  ): { x: number; y: number; z: number; w: number } {
    const p2wzyx = { x: d2, y: c2, z: b2, w: a2 };
    const p3yxwz = { x: b3, y: a3, z: d3, w: c3 };
    const p2yxwz = { x: b2, y: a2, z: d2, w: c2 };
    const p3wzyx = { x: d3, y: c3, z: b3, w: a3 };
    return {
      x: p2wzyx.x * p3yxwz.x - p2yxwz.x * p3wzyx.x,
      y: p2wzyx.y * p3yxwz.y - p2yxwz.y * p3wzyx.y,
      z: p2wzyx.z * p3yxwz.z - p2yxwz.z * p3wzyx.z,
      w: p2wzyx.w * p3yxwz.w - p2yxwz.w * p3wzyx.w,
    };
  }

  /**
   * Builds Nx = plane2.yyww * plane3.xzzx - plane2.xzzx * plane3.yyww.
   *
   * @param a2 Plane2 nx.
   * @param b2 Plane2 ny.
   * @param c2 Plane2 nz.
   * @param d2 Plane2 d.
   * @param a3 Plane3 nx.
   * @param b3 Plane3 ny.
   * @param c3 Plane3 nz.
   * @param d3 Plane3 d.
   * @returns Nx as {x,y,z,w}.
   */
  private static buildNx(
    a2: number,
    b2: number,
    c2: number,
    d2: number,
    a3: number,
    b3: number,
    c3: number,
    d3: number,
  ): { x: number; y: number; z: number; w: number } {
    const p2yyww = { x: b2, y: b2, z: d2, w: d2 };
    const p3xzzx = { x: a3, y: c3, z: c3, w: a3 };
    const p2xzzx = { x: a2, y: c2, z: c2, w: a2 };
    const p3yyww = { x: b3, y: b3, z: d3, w: d3 };
    return {
      x: p2yyww.x * p3xzzx.x - p2xzzx.x * p3yyww.x,
      y: p2yyww.y * p3xzzx.y - p2xzzx.y * p3yyww.y,
      z: p2yyww.z * p3xzzx.z - p2xzzx.z * p3yyww.z,
      w: p2yyww.w * p3xzzx.w - p2xzzx.w * p3yyww.w,
    };
  }

  /**
   * Builds E = tx + ty + tz from plane1 and N0/Nx.
   *
   * @param a1 Plane1 nx.
   * @param b1 Plane1 ny.
   * @param c1 Plane1 nz.
   * @param d1 Plane1 d.
   * @param n0 N0 vector.
   * @param nx Nx vector.
   * @returns E as {x,y,z,w} where result is E.zwx / E.y.
   */
  private static buildE(
    a1: number,
    b1: number,
    c1: number,
    d1: number,
    n0: { x: number; y: number; z: number; w: number },
    nx: { x: number; y: number; z: number; w: number },
  ): { x: number; y: number; z: number; w: number } {
    const tx = { x: a1 * n0.x, y: b1 * n0.y, z: c1 * n0.z, w: d1 * n0.w };
    const ty = { x: d1 * nx.x, y: a1 * nx.y, z: b1 * nx.z, w: c1 * nx.w };
    const nxRot = { x: nx.w, y: nx.x, z: nx.y, w: nx.z };
    const tz = {
      x: b1 * -nxRot.x,
      y: c1 * -nxRot.y,
      z: d1 * -nxRot.z,
      w: a1 * -nxRot.w,
    };
    return {
      x: tx.x + ty.x + tz.x,
      y: tx.y + ty.y + tz.y,
      z: tx.z + ty.z + tz.z,
      w: tx.w + ty.w + tz.w,
    };
  }
}
