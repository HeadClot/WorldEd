import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import {
  SOLID_NORMAL_ALIGN_EPSILON,
  SOLID_PLANE_D_ALIGN_EPSILON,
} from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import type { SolidAlgorithmSurfaceInfo } from './solid_algorithm_surface_info.js';
import { solidAlgorithmSurfaceInfoBase } from './solid_algorithm_surface_info.js';

/** Marks coplanar face pairs as Aligned / ReverseAligned. */
export class SolidAlgorithmPrepareBrushPairAligned {
  /**
   * Builds surface infos for both brushes and marks aligned planes.
   *
   * @param type Pair intersection type.
   * @param brushIndex0 First brush prepared index.
   * @param planeIndices0 Intersecting plane indices of brush0.
   * @param planes0 All face planes of brush0.
   * @param brushIndex1 Second brush prepared index.
   * @param planeIndices1 Intersecting plane indices of brush1.
   * @param planes1 All face planes of brush1.
   * @returns Surface info arrays for both brushes (length = face count).
   */
  static find(
    type: SolidAlgorithmIntersectionType,
    brushIndex0: number,
    planeIndices0: readonly number[],
    planes0: readonly SolidPlane[],
    brushIndex1: number,
    planeIndices1: readonly number[],
    planes1: readonly SolidPlane[],
  ): { surfaceInfos0: SolidAlgorithmSurfaceInfo[]; surfaceInfos1: SolidAlgorithmSurfaceInfo[] } {
    const surfaceInfos0 = this.buildDefaultInfos(brushIndex0, planes0.length);
    const surfaceInfos1 = this.buildDefaultInfos(brushIndex1, planes1.length);
    if (type === SolidAlgorithmIntersectionType.Intersection) {
      this.markAlignedPairs(planeIndices0, planes0, surfaceInfos0, planeIndices1, planes1, surfaceInfos1);
    }
    return { surfaceInfos0, surfaceInfos1 };
  }

  /**
   * Builds default Inside surface infos for every face plane.
   *
   * @param brushIndex Prepared brush index.
   * @param planeCount Face plane count.
   * @returns Surface info array.
   */
  private static buildDefaultInfos(brushIndex: number, planeCount: number): SolidAlgorithmSurfaceInfo[] {
    const infos: SolidAlgorithmSurfaceInfo[] = [];
    for (let planeIndex = 0; planeIndex < planeCount; planeIndex++) {
      infos.push(solidAlgorithmSurfaceInfoBase(brushIndex, planeIndex));
    }
    return infos;
  }

  /**
   * Compares intersecting plane pairs for alignment.
   *
   * @param planeIndices0 Brush0 intersecting indices.
   * @param planes0 Brush0 planes.
   * @param surfaceInfos0 Brush0 surface infos (mutated).
   * @param planeIndices1 Brush1 intersecting indices.
   * @param planes1 Brush1 planes.
   * @param surfaceInfos1 Brush1 surface infos (mutated).
   */
  private static markAlignedPairs(
    planeIndices0: readonly number[],
    planes0: readonly SolidPlane[],
    surfaceInfos0: SolidAlgorithmSurfaceInfo[],
    planeIndices1: readonly number[],
    planes1: readonly SolidPlane[],
    surfaceInfos1: SolidAlgorithmSurfaceInfo[],
  ): void {
    for (const planeIndex0 of planeIndices0) {
      const plane0 = planes0[planeIndex0];
      if (!plane0) {
        continue;
      }
      for (const planeIndex1 of planeIndices1) {
        const plane1 = planes1[planeIndex1];
        if (!plane1) {
          continue;
        }
        this.tryMarkOnePair(planeIndex0, plane0, surfaceInfos0, planeIndex1, plane1, surfaceInfos1);
      }
    }
  }

  /**
   * Marks one plane pair when coplanar aligned or reverse-aligned.
   *
   * @param planeIndex0 Brush0 plane index.
   * @param plane0 Brush0 plane.
   * @param surfaceInfos0 Brush0 infos.
   * @param planeIndex1 Brush1 plane index.
   * @param plane1 Brush1 plane.
   * @param surfaceInfos1 Brush1 infos.
   */
  private static tryMarkOnePair(
    planeIndex0: number,
    plane0: SolidPlane,
    surfaceInfos0: SolidAlgorithmSurfaceInfo[],
    planeIndex1: number,
    plane1: SolidPlane,
    surfaceInfos1: SolidAlgorithmSurfaceInfo[],
  ): void {
    if (this.isSameAligned(plane0, plane1)) {
      this.setCategory(surfaceInfos0, planeIndex0, SurfaceCategory.Aligned);
      this.setCategory(surfaceInfos1, planeIndex1, SurfaceCategory.Aligned);
      return;
    }
    if (this.isReverseAligned(plane0, plane1)) {
      this.setCategory(surfaceInfos0, planeIndex0, SurfaceCategory.ReverseAligned);
      this.setCategory(surfaceInfos1, planeIndex1, SurfaceCategory.ReverseAligned);
    }
  }

  /**
   * Returns whether two planes share normal and offset within align epsilons.
   *
   * @param plane0 First plane.
   * @param plane1 Second plane.
   * @returns True when same-aligned.
   */
  private static isSameAligned(plane0: SolidPlane, plane1: SolidPlane): boolean {
    if (Math.abs(plane0.offset - plane1.offset) >= SOLID_PLANE_D_ALIGN_EPSILON) {
      return false;
    }
    return plane0.normal.dot(plane1.normal) >= SOLID_NORMAL_ALIGN_EPSILON;
  }

  /**
   * Returns whether two planes are opposite-aligned.
   *
   * @param plane0 First plane.
   * @param plane1 Second plane.
   * @returns True when reverse-aligned.
   */
  private static isReverseAligned(plane0: SolidPlane, plane1: SolidPlane): boolean {
    if (Math.abs(plane0.offset + plane1.offset) >= SOLID_PLANE_D_ALIGN_EPSILON) {
      return false;
    }
    return plane0.normal.dot(plane1.normal) <= -SOLID_NORMAL_ALIGN_EPSILON;
  }

  /**
   * Writes interior category for one surface info slot.
   *
   * @param surfaceInfos Surface info array.
   * @param planeIndex Face index.
   * @param category Category to store.
   */
  private static setCategory(
    surfaceInfos: SolidAlgorithmSurfaceInfo[],
    planeIndex: number,
    category: SurfaceCategory,
  ): void {
    const info = surfaceInfos[planeIndex];
    if (!info) {
      return;
    }
    surfaceInfos[planeIndex] = {
      brushIndex: info.brushIndex,
      basePlaneIndex: info.basePlaneIndex,
      interiorCategory: category,
    };
  }
}
