import * as THREE from 'three';
import { SolidPlane } from '../brush/solid_plane.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SurfaceCategory } from '../types/surface_category.js';
import type { PreparedBrush } from './solid_compile_types.js';
import { SolidCompiledPolygon } from './solid_compiled_polygon.js';
import { SolidFragmentFinalizer } from './solid_fragment_finalizer.js';
import { SurfaceFragmentSplitter } from './surface_fragment_splitter.js';

/**
 * Emits compiled surface polygons for prepared brushes by splitting faces and
 * finalizing fragments.
 */
export class SolidSurfaceEmitter {
  private readonly finalizer: SolidFragmentFinalizer;
  private readonly membershipEpsilon: number;
  private hasIntersectingOperations = false;
  private readonly scratchFaceBounds = new THREE.Box3();

  /**
   * Creates a surface emitter.
   *
   * @param finalizer Fragment finalizer for classification and polygon build.
   * @param membershipEpsilon Fat-plane epsilon for cut-plane detection.
   */
  constructor(finalizer: SolidFragmentFinalizer, membershipEpsilon: number) {
    this.finalizer = finalizer;
    this.membershipEpsilon = membershipEpsilon;
  }

  /**
   * Updates whether sequential intersecting ops are present (forces membership
   * on isolated additives so they can be clipped by a distant ∩).
   *
   * @param value True when any brush uses intersecting CSG.
   */
  setHasIntersectingOperations(value: boolean): void {
    this.hasIntersectingOperations = value;
  }

  /**
   * Compiles all faces of one brush into the output list.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex Index of the subject brush.
   * @param output Accumulator for compiled polygons.
   */
  compileBrushSurfaces(prepared: PreparedBrush[], brushIndex: number, output: SolidCompiledPolygon[]): void {
    const subject = prepared[brushIndex]!;
    if (subject.overlappingPeerIndices.length === 0) {
      this.emitIsolatedBrushSurfaces(subject, prepared, brushIndex, output);
      return;
    }
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      this.compileBrushFace(prepared, brushIndex, faceIndex, output);
    }
  }

  /**
   * Compiles a single face of a brush into surface fragments.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex Subject brush index.
   * @param faceIndex Face index on the subject brush.
   * @param output Polygon accumulator.
   */
  compileBrushFace(
    prepared: PreparedBrush[],
    brushIndex: number,
    faceIndex: number,
    output: SolidCompiledPolygon[],
  ): void {
    const subject = prepared[brushIndex]!;
    const face = subject.brush.faces[faceIndex]!;
    const faceVertices = subject.brush.getFaceVertices(face);
    const facePlane = subject.brush.planes[faceIndex]!;
    const cutPlanes = this.collectCutPlanes(prepared, brushIndex, facePlane, faceVertices);
    const fragments = this.splitFaceFragments(faceVertices, cutPlanes);
    this.finalizeFaceFragments(fragments, facePlane, face.surfaceIndex, subject, prepared, brushIndex, output);
  }

  /**
   * Fast path for a brush that does not overlap any peer volume.
   *
   * @param subject Isolated brush.
   * @param prepared All brushes (for membership tests when needed).
   * @param brushIndex Subject index.
   * @param output Polygon accumulator.
   */
  emitIsolatedBrushSurfaces(
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    brushIndex: number,
    output: SolidCompiledPolygon[],
  ): void {
    if (subject.operation === SolidOperation.Subtractive) return;
    if (subject.operation === SolidOperation.Intersecting) return;
    if (!this.hasIntersectingOperations) {
      this.emitIsolatedAdditiveSurfacesDirect(subject, output);
      return;
    }
    // Sequential ∩ may discard this brush even when it has no AABB peers.
    this.emitIsolatedSurfacesWithMembership(subject, prepared, brushIndex, output);
  }

  /**
   * Emits isolated additive faces using full membership classification.
   *
   * @param subject Isolated brush.
   * @param prepared All brushes.
   * @param brushIndex Subject index.
   * @param output Polygon accumulator.
   */
  emitIsolatedSurfacesWithMembership(
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    brushIndex: number,
    output: SolidCompiledPolygon[],
  ): void {
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      const face = subject.brush.faces[faceIndex]!;
      const compiled = this.finalizer.finalizeFragment(
        subject.brush.getFaceVertices(face),
        subject.brush.planes[faceIndex]!,
        face.surfaceIndex,
        subject,
        prepared,
        brushIndex,
      );
      if (compiled) output.push(compiled);
    }
  }

  /**
   * Emits exterior faces of an isolated additive brush without membership
   * tests.
   *
   * @param subject Isolated additive brush.
   * @param output Polygon accumulator.
   */
  emitIsolatedAdditiveSurfacesDirect(subject: PreparedBrush, output: SolidCompiledPolygon[]): void {
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      this.emitOneIsolatedAdditiveFace(subject, faceIndex, output);
    }
  }

  /**
   * Collects planes from overlapping peer brushes that may cut the subject
   * face.
   *
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @param facePlane Subject face plane.
   * @param faceVertices Subject face vertices.
   * @returns Planes for fragment splitting.
   */
  collectCutPlanes(
    prepared: PreparedBrush[],
    subjectIndex: number,
    facePlane: SolidPlane,
    faceVertices: THREE.Vector3[],
  ): SolidPlane[] {
    const planes: SolidPlane[] = [];
    const subject = prepared[subjectIndex]!;
    this.fillFaceBounds(faceVertices);
    for (const peerIndex of subject.overlappingPeerIndices) {
      const peer = prepared[peerIndex]!;
      if (!this.boundsOverlapPadded(this.scratchFaceBounds, peer.bounds)) continue;
      this.collectPeerCutPlanes(peer, facePlane, faceVertices, planes);
    }
    return planes;
  }

  /**
   * Writes a tight AABB around face vertices into scratchFaceBounds.
   *
   * @param faceVertices Face polygon vertices.
   */
  private fillFaceBounds(faceVertices: THREE.Vector3[]): void {
    this.scratchFaceBounds.makeEmpty();
    for (const vertex of faceVertices) {
      this.scratchFaceBounds.expandByPoint(vertex);
    }
  }

  /**
   * Returns whether two bounds may touch using membership pad.
   *
   * @param a First bounds.
   * @param b Second bounds.
   * @returns True when they may overlap.
   */
  private boundsOverlapPadded(a: THREE.Box3, b: THREE.Box3): boolean {
    const pad = this.membershipEpsilon * 2;
    return !(
      a.max.x + pad < b.min.x ||
      a.min.x - pad > b.max.x ||
      a.max.y + pad < b.min.y ||
      a.min.y - pad > b.max.y ||
      a.max.z + pad < b.min.z ||
      a.min.z - pad > b.max.z
    );
  }

  /**
   * Returns whether a plane straddles a polygon (may produce a cut).
   *
   * @param polygon Face or fragment vertices.
   * @param plane Candidate cut plane.
   * @returns True when the plane may split the polygon.
   */
  planeLikelyCutsPolygon(polygon: THREE.Vector3[], plane: SolidPlane): boolean {
    let sawInside = false;
    let sawOutside = false;
    for (const point of polygon) {
      const distance = plane.signedDistance(point);
      if (distance > this.membershipEpsilon) sawOutside = true;
      if (distance < -this.membershipEpsilon) sawInside = true;
      if (sawInside && sawOutside) return true;
    }
    return false;
  }

  /**
   * Splits face vertices by cut planes when any exist.
   *
   * @param faceVertices Original face vertices.
   * @param cutPlanes Planes that may cut the face.
   * @returns Fragment polygons.
   */
  private splitFaceFragments(faceVertices: THREE.Vector3[], cutPlanes: SolidPlane[]): THREE.Vector3[][] {
    if (cutPlanes.length === 0) return [faceVertices];
    return SurfaceFragmentSplitter.splitByPlanes(faceVertices, cutPlanes);
  }

  /**
   * Finalizes each face fragment into the output list.
   *
   * @param fragments Face fragments.
   * @param facePlane Original face plane.
   * @param surfaceIndex Face surface index.
   * @param subject Subject prepared brush.
   * @param prepared All brushes.
   * @param brushIndex Subject index.
   * @param output Polygon accumulator.
   */
  private finalizeFaceFragments(
    fragments: THREE.Vector3[][],
    facePlane: SolidPlane,
    surfaceIndex: number,
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    brushIndex: number,
    output: SolidCompiledPolygon[],
  ): void {
    for (const fragment of fragments) {
      const compiled = this.finalizer.finalizeFragment(
        fragment,
        facePlane,
        surfaceIndex,
        subject,
        prepared,
        brushIndex,
      );
      if (compiled) output.push(compiled);
    }
  }

  /**
   * Emits one isolated additive face when it has enough vertices.
   *
   * @param subject Isolated additive brush.
   * @param faceIndex Face index.
   * @param output Polygon accumulator.
   */
  private emitOneIsolatedAdditiveFace(subject: PreparedBrush, faceIndex: number, output: SolidCompiledPolygon[]): void {
    const face = subject.brush.faces[faceIndex]!;
    const faceVertices = subject.brush.getFaceVertices(face);
    const facePlane = subject.brush.planes[faceIndex]!;
    if (faceVertices.length < 3) return;
    output.push({
      vertices: faceVertices,
      normal: facePlane.normal.clone(),
      surfaceIndex: face.surfaceIndex,
      brushId: subject.instance.id,
      textureId: subject.instance.getSurfaceTextureId(face.surfaceIndex),
      category: SurfaceCategory.SelfAligned,
    });
  }

  /**
   * Appends cut planes from one peer brush that may split the subject face.
   *
   * @param peer Peer prepared brush.
   * @param facePlane Subject face plane.
   * @param faceVertices Subject face vertices.
   * @param planes Accumulator for cut planes.
   */
  private collectPeerCutPlanes(
    peer: PreparedBrush,
    facePlane: SolidPlane,
    faceVertices: THREE.Vector3[],
    planes: SolidPlane[],
  ): void {
    for (const plane of peer.brush.planes) {
      if (facePlane.isAlignedWith(plane) || facePlane.isReverseAlignedWith(plane)) {
        continue;
      }
      if (!this.planeLikelyCutsPolygon(faceVertices, plane)) continue;
      planes.push(plane);
    }
  }
}
