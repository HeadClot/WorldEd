import type { SolidPlane } from '@/solid/brush/solid_plane.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SOLID_BOUNDS_EPSILON, SOLID_FAT_PLANE_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidAlgorithmBrushIntersection } from '@/solid/algorithm/routing/solid_algorithm_brush_intersection.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import { SolidAlgorithmIntersectingPlanes } from './solid_algorithm_intersecting_planes.js';

/**
 * One Chisel PrepareBrushPairIntersections local table for a subject/peer pair:
 * intersection type and the peer planes that may cut the subject volume.
 */
export interface SolidAlgorithmBrushPairLocalEntry {
  /** Peer prepared index. */
  peerIndex: number;
  /** Subject-centric intersection type for this pair. */
  type: SolidAlgorithmIntersectionType;
  /**
   * Peer planes that participate in the intersection (GetIntersectingPlanes on
   * the peer side against the subject volume). Empty when the pair is separated
   * or not an Intersection pair used for loops.
   */
  peerCutPlanes: readonly SolidPlane[];
}

/**
 * Builds and holds brush-local pair tables for one subject (Chisel
 * PrepareBrushPairIntersectionsJob output, reused for every face of the subject
 * instead of recomputing per face).
 */
export class SolidAlgorithmBrushPairLocalTable {
  private readonly entriesByPeerIndex = new Map<number, SolidAlgorithmBrushPairLocalEntry>();

  /**
   * Builds local tables for every spatial peer of the subject.
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param boundsPad Bounds pad for intersection classification.
   * @param membershipEpsilon Plane epsilon for polytope touching.
   * @param fatPlaneEpsilon Fat-plane width for GetIntersectingPlanes.
   * @returns Local pair table for the subject.
   */
  static buildForSubject(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    boundsPad: number = SOLID_BOUNDS_EPSILON,
    membershipEpsilon: number = SOLID_FAT_PLANE_EPSILON,
    fatPlaneEpsilon: number = SOLID_FAT_PLANE_EPSILON,
  ): SolidAlgorithmBrushPairLocalTable {
    const table = new SolidAlgorithmBrushPairLocalTable();
    const subject = prepared[subjectIndex];
    if (!subject) {
      return table;
    }
    for (const peerIndex of subject.overlappingPeerIndices) {
      if (peerIndex === subjectIndex) {
        continue;
      }
      const peer = prepared[peerIndex];
      if (!peer) {
        continue;
      }
      table.entriesByPeerIndex.set(
        peerIndex,
        this.buildOneEntry(subject, peerIndex, prepared, boundsPad, membershipEpsilon, fatPlaneEpsilon),
      );
    }
    return table;
  }

  /**
   * Returns the local entry for one peer, if present.
   *
   * @param peerIndex Peer prepared index.
   * @returns Pair entry, or undefined when the peer is not a spatial peer.
   */
  get(peerIndex: number): SolidAlgorithmBrushPairLocalEntry | undefined {
    return this.entriesByPeerIndex.get(peerIndex);
  }

  /**
   * Returns every pair entry for this subject.
   *
   * @returns Local pair entries.
   */
  getAllEntries(): readonly SolidAlgorithmBrushPairLocalEntry[] {
    return Array.from(this.entriesByPeerIndex.values());
  }

  /**
   * Builds one subject/peer local entry.
   *
   * @param subject Subject prepared brush.
   * @param peerIndex Peer prepared index.
   * @param prepared All prepared brushes.
   * @param boundsPad Bounds pad.
   * @param membershipEpsilon Polytope epsilon.
   * @param fatPlaneEpsilon Fat-plane width.
   * @returns Local pair entry.
   */
  private static buildOneEntry(
    subject: PreparedBrush,
    peerIndex: number,
    prepared: readonly PreparedBrush[],
    boundsPad: number,
    membershipEpsilon: number,
    fatPlaneEpsilon: number,
  ): SolidAlgorithmBrushPairLocalEntry {
    const peer = prepared[peerIndex]!;
    const type = SolidAlgorithmBrushIntersection.classify(subject, peerIndex, prepared, boundsPad, membershipEpsilon);
    const peerCutPlanes =
      type === SolidAlgorithmIntersectionType.Intersection
        ? SolidAlgorithmIntersectingPlanes.collectPlanes(
            type,
            peer.brush.planes,
            subject.bounds,
            subject.brush.vertices,
            fatPlaneEpsilon,
          )
        : [];
    return { peerIndex, type, peerCutPlanes };
  }
}
