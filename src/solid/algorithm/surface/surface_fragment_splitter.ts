import * as THREE from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SOLID_FAT_PLANE_EPSILON, SOLID_PLANE_CUT_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
import { ConvexPolygonClipper } from './convex_polygon_clipper.js';

/**
 * Splits a convex surface polygon by an arrangement of planes so each resulting
 * fragment has constant solid membership against those half-spaces.
 */
export class SurfaceFragmentSplitter {
  /**
   * Splits a polygon by every provided plane into atomic fragments.
   *
   * @param polygon Source convex polygon.
   * @param planes Planes that may cut the polygon.
   * @param vertexTable Optional welder shared with other faces of the same
   *   brush. When omitted, a temporary table is created for this call.
   * @returns List of non-empty convex fragments.
   */
  static splitByPlanes(
    polygon: THREE.Vector3[],
    planes: SolidPlane[],
    vertexTable?: HashedVertexTable,
  ): THREE.Vector3[][] {
    const welder = vertexTable ?? new HashedVertexTable();
    let fragments: THREE.Vector3[][] = [this.seedPolygonVertices(polygon, welder)];
    for (const plane of planes) {
      fragments = this.splitFragmentsByPlane(fragments, plane, welder);
      if (fragments.length === 0) {
        return [];
      }
    }
    return fragments.filter((fragment) => fragment.length >= 3);
  }

  /**
   * Returns whether a plane straddles a polygon tightly enough to produce a
   * cut. Uses SOLID_PLANE_CUT_EPSILON so fat membership bands do not hide real
   * cuts.
   *
   * @param polygon Polygon vertices.
   * @param plane Candidate cut plane.
   * @param epsilon Optional straddle threshold.
   * @returns True when the plane may split the polygon.
   */
  static planeLikelyCutsPolygon(
    polygon: THREE.Vector3[],
    plane: SolidPlane,
    epsilon: number = SOLID_PLANE_CUT_EPSILON,
  ): boolean {
    let sawInside = false;
    let sawOutside = false;
    for (const point of polygon) {
      const distance = plane.signedDistance(point);
      if (distance > epsilon) {
        sawOutside = true;
      }
      if (distance < -epsilon) {
        sawInside = true;
      }
      if (sawInside && sawOutside) {
        return true;
      }
    }
    return false;
  }

  /**
   * Seeds face vertices through the welder so shared edge endpoints match
   * Chisel HashedVertices.Add (canonical welded positions).
   *
   * @param polygon Source polygon.
   * @param welder Vertex welder.
   * @returns Seeded polygon clones at welded positions.
   */
  private static seedPolygonVertices(polygon: THREE.Vector3[], welder: HashedVertexTable): THREE.Vector3[] {
    return polygon.map((point) => welder.snap(point));
  }

  /**
   * Splits every fragment by a single plane into inside and outside pieces.
   *
   * @param fragments Current fragments.
   * @param plane Clipping plane.
   * @param welder Vertex welder for clip intersections.
   * @returns Updated fragment list.
   */
  private static splitFragmentsByPlane(
    fragments: THREE.Vector3[][],
    plane: SolidPlane,
    welder: HashedVertexTable,
  ): THREE.Vector3[][] {
    const next: THREE.Vector3[][] = [];
    for (const fragment of fragments) {
      this.appendSplitOrUncutFragment(fragment, plane, welder, next);
    }
    return next;
  }

  /**
   * Appends either the original fragment or its inside/outside clips.
   *
   * @param fragment Current convex fragment.
   * @param plane Candidate cut plane.
   * @param welder Vertex welder.
   * @param next Accumulator for next fragment list.
   */
  private static appendSplitOrUncutFragment(
    fragment: THREE.Vector3[],
    plane: SolidPlane,
    welder: HashedVertexTable,
    next: THREE.Vector3[][],
  ): void {
    if (!this.planeLikelyCutsPolygon(fragment, plane)) {
      next.push(fragment);
      return;
    }
    const clipped = ConvexPolygonClipper.clipByPlane(fragment, plane, SOLID_FAT_PLANE_EPSILON, welder);
    if (clipped.inside.length >= 3) {
      next.push(clipped.inside);
    }
    if (clipped.outside.length >= 3) {
      next.push(clipped.outside);
    }
  }
}
