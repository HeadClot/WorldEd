import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidAlgorithmBrushIntersection } from '@/solid/algorithm/routing/solid_algorithm_brush_intersection.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import { SolidAlgorithmIntersectingPlanes } from '@/solid/algorithm/spatial/solid_algorithm_intersecting_planes.js';
import type {
  SolidAlgorithmBrushPairIntersection,
  SolidAlgorithmBrushPairIntersectionInfo,
} from './solid_algorithm_brush_pair_intersection_info.js';
import type { SolidAlgorithmSurfaceInfo } from './solid_algorithm_surface_info.js';
import { SolidAlgorithmPrepareBrushPairAligned } from './solid_algorithm_prepare_brush_pair_aligned.js';
import { SolidAlgorithmPrepareBrushPairPlanePairs } from './solid_algorithm_prepare_brush_pair_plane_pairs.js';
import { SolidAlgorithmPrepareBrushPairVertexPlanes } from './solid_algorithm_prepare_brush_pair_vertex_planes.js';

/**
 * Prepares one Intersection brush pair for CreateIntersectionLoops. Brushes are
 * already in model space.
 */
export class SolidAlgorithmPrepareBrushPair {
  /**
   * Builds pair intersection data for two prepared brushes, or null when the
   * pair cannot produce intersection loops.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex0 First prepared index.
   * @param brushIndex1 Second prepared index.
   * @param boundsPad Bounds pad for classification.
   * @param membershipEpsilon Polytope epsilon.
   * @param fatPlaneEpsilon Fat-plane width.
   * @returns Pair data, or null when invalid / separated.
   */
  static prepare(
    prepared: readonly PreparedBrush[],
    brushIndex0: number,
    brushIndex1: number,
    boundsPad: number,
    membershipEpsilon: number,
    fatPlaneEpsilon: number = SOLID_FAT_PLANE_EPSILON,
  ): SolidAlgorithmBrushPairIntersection | null {
    const brush0 = prepared[brushIndex0];
    const brush1 = prepared[brushIndex1];
    if (!brush0 || !brush1) {
      return null;
    }
    const type = SolidAlgorithmBrushIntersection.classify(brush0, brushIndex1, prepared, boundsPad, membershipEpsilon);
    if (!this.isUsableType(type)) {
      return null;
    }
    return this.buildPair(brush0, brushIndex0, brush1, brushIndex1, type, fatPlaneEpsilon);
  }

  /**
   * Returns whether the type participates in pair preparation.
   *
   * @param type Intersection type.
   * @returns True for Intersection / AInsideB / BInsideA.
   */
  private static isUsableType(type: SolidAlgorithmIntersectionType): boolean {
    return (
      type === SolidAlgorithmIntersectionType.Intersection ||
      type === SolidAlgorithmIntersectionType.AInsideB ||
      type === SolidAlgorithmIntersectionType.BInsideA
    );
  }

  /**
   * Builds the full pair structure after type validation.
   *
   * @param brush0 First prepared brush.
   * @param brushIndex0 First index.
   * @param brush1 Second prepared brush.
   * @param brushIndex1 Second index.
   * @param type Intersection type.
   * @param fatPlaneEpsilon Fat-plane width.
   * @returns Pair data, or null when separated.
   */
  private static buildPair(
    brush0: PreparedBrush,
    brushIndex0: number,
    brush1: PreparedBrush,
    brushIndex1: number,
    type: SolidAlgorithmIntersectionType,
    fatPlaneEpsilon: number,
  ): SolidAlgorithmBrushPairIntersection | null {
    const planeIndices0 = SolidAlgorithmIntersectingPlanes.collectIndices(
      type,
      brush0.brush.planes,
      brush1.bounds,
      brush1.brush.vertices,
      fatPlaneEpsilon,
    );
    if (planeIndices0.length === 0) {
      return null;
    }
    const planeIndices1 = SolidAlgorithmIntersectingPlanes.collectIndices(
      type,
      brush1.brush.planes,
      brush0.bounds,
      brush0.brush.vertices,
      fatPlaneEpsilon,
    );
    if (planeIndices1.length === 0) {
      return null;
    }
    return this.assemblePair(brush0, brushIndex0, planeIndices0, brush1, brushIndex1, planeIndices1, type);
  }

  /**
   * Assembles both BrushIntersectionInfo sides.
   *
   * @param brush0 First prepared brush.
   * @param brushIndex0 First index.
   * @param planeIndices0 Intersecting indices for brush0.
   * @param brush1 Second prepared brush.
   * @param brushIndex1 Second index.
   * @param planeIndices1 Intersecting indices for brush1.
   * @param type Intersection type.
   * @returns Complete pair.
   */
  private static assemblePair(
    brush0: PreparedBrush,
    brushIndex0: number,
    planeIndices0: readonly number[],
    brush1: PreparedBrush,
    brushIndex1: number,
    planeIndices1: readonly number[],
    type: SolidAlgorithmIntersectionType,
  ): SolidAlgorithmBrushPairIntersection {
    const { surfaceInfos0, surfaceInfos1 } = SolidAlgorithmPrepareBrushPairAligned.find(
      type,
      brushIndex0,
      planeIndices0,
      brush0.brush.planes,
      brushIndex1,
      planeIndices1,
      brush1.brush.planes,
    );
    const side0 = this.buildSide(brush0, brushIndex0, planeIndices0, surfaceInfos0, type);
    const side1 = this.buildSide(brush1, brushIndex1, planeIndices1, surfaceInfos1, type);
    return { type, brush0: side0, brush1: side1 };
  }

  /**
   * Builds one side of the pair.
   *
   * @param prepared Prepared brush.
   * @param brushIndex Prepared index.
   * @param planeIndices Intersecting face indices.
   * @param surfaceInfos Surface infos for all faces.
   * @param type Intersection type.
   * @returns Brush intersection info.
   */
  private static buildSide(
    prepared: PreparedBrush,
    brushIndex: number,
    planeIndices: readonly number[],
    surfaceInfos: SolidAlgorithmSurfaceInfo[],
    type: SolidAlgorithmIntersectionType,
  ): SolidAlgorithmBrushPairIntersectionInfo {
    const planes = prepared.brush.planes;
    const { usedPlanePairs, usedVertices } = SolidAlgorithmPrepareBrushPairPlanePairs.find(
      type,
      prepared.brush,
      planeIndices,
      planes,
    );
    const localSpacePlanes = planeIndices.map((index) => planes[index]!);
    const vertexPlanes = SolidAlgorithmPrepareBrushPairVertexPlanes.find(usedVertices, planeIndices, planes);
    return {
      brushIndex,
      usedVertices,
      usedPlanePairs,
      localSpacePlanes,
      localSpacePlanesLength: localSpacePlanes.length,
      localSpacePlaneIndices: planeIndices.slice(),
      vertexIntersectionPlanes: vertexPlanes.vertexIntersectionPlanes,
      vertexIntersectionSegments: vertexPlanes.vertexIntersectionSegments,
      surfaceInfos,
    };
  }
}
