import * as THREE from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { boundsOverlapPadded } from '@/solid/algorithm/spatial/bounds_overlap.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SolidFragmentFinalizer } from '@/solid/algorithm/compile/solid_fragment_finalizer.js';
import { SolidAlgorithmRoutingPeers } from '@/solid/algorithm/routing/solid_algorithm_routing_peers.js';
import { SolidAlgorithmBrushIntersection } from '@/solid/algorithm/routing/solid_algorithm_brush_intersection.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import { SurfaceFragmentSplitter } from './surface_fragment_splitter.js';

/**
 * Emits compiled surface polygons for prepared brushes by splitting faces and
 * finalizing fragments.
 */
export class SolidSurfaceEmitter {
  private readonly finalizer: SolidFragmentFinalizer;
  private readonly membershipEpsilon: number;
  private invertedWorld = false;
  private hierarchicalCsg = false;
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
   * Kept for call-site compatibility. Distant ∩ never affects non-touching
   * isolated brushes (Chisel peer tables), so this flag is unused for
   * emission.
   *
   * @param _value Unused.
   */
  setHasIntersectingOperations(_value: boolean): void {
    void _value;
  }

  /**
   * Sets inverted-world mode for isolated surface emission.
   *
   * @param value True when the world begins full.
   */
  setInvertedWorld(value: boolean): void {
    this.invertedWorld = value;
  }

  /**
   * Sets whether hierarchical branch/leaf CSG is active (any solid CSG group).
   * Isolated additive direct emission is disabled in hierarchical mode so group
   * operations still affect single-child compounds (Chisel branch model).
   *
   * @param value True when the CSG tree is not flat.
   */
  setHierarchicalCsg(value: boolean): void {
    this.hierarchicalCsg = value;
  }

  /**
   * Compiles all faces of one brush into the output list.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex Index of the subject brush.
   * @param output Accumulator for compiled polygons.
   */
  compileBrushSurfaces(prepared: PreparedBrush[], brushIndex: number, output: SolidCompiledPolygon[]): void {
    const subject = prepared[brushIndex];
    if (!subject) return;
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
    const subject = prepared[brushIndex];
    if (!subject) return;
    const face = subject.brush.faces[faceIndex];
    const facePlane = subject.brush.planes[faceIndex];
    if (!face || !facePlane) return;
    const faceVertices = subject.brush.getFaceVertices(face);
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
    if (subject.operation === SolidOperation.Intersecting && !this.invertedWorld && !this.hierarchicalCsg) {
      return;
    }
    if (subject.operation === SolidOperation.Subtractive && !this.invertedWorld && !this.hierarchicalCsg) {
      return;
    }
    if (!this.invertedWorld && !this.hierarchicalCsg) {
      if (subject.operation === SolidOperation.Additive) {
        this.emitIsolatedAdditiveSurfacesDirect(subject, output);
      }
      return;
    }
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
      const face = subject.brush.faces[faceIndex];
      const facePlane = subject.brush.planes[faceIndex];
      if (!face || !facePlane) continue;
      const compiled = this.finalizer.finalizeFragment(
        subject.brush.getFaceVertices(face),
        facePlane,
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
   * face. Peers with AInsideB / BInsideA (Chisel non-Intersection) do not
   * contribute cut planes; CreateIntersectionLoops only builds loops for
   * Intersection pairs.
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
    const subject = prepared[subjectIndex];
    if (!subject) {
      return planes;
    }
    this.fillFaceBounds(faceVertices);
    const pad = this.membershipEpsilon * 2;
    for (const peerIndex of subject.overlappingPeerIndices) {
      if (!SolidAlgorithmRoutingPeers.peerBelongsInSubjectTable(prepared, subjectIndex, peerIndex)) {
        continue;
      }
      if (!this.peerContributesIntersectionLoops(prepared, subjectIndex, peerIndex, pad)) {
        continue;
      }
      const peer = prepared[peerIndex];
      if (!peer) {
        continue;
      }
      if (!boundsOverlapPadded(this.scratchFaceBounds, peer.bounds, pad)) {
        continue;
      }
      this.collectPeerCutPlanes(peer, facePlane, faceVertices, planes);
    }
    return planes;
  }

  /**
   * Returns whether a peer has true Intersection type vs the subject (not full
   * containment shortcuts).
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @param peerIndex Peer index.
   * @param pad Bounds pad.
   * @returns True when cut planes from this peer may be needed.
   */
  private peerContributesIntersectionLoops(
    prepared: PreparedBrush[],
    subjectIndex: number,
    peerIndex: number,
    pad: number,
  ): boolean {
    const subject = prepared[subjectIndex];
    if (!subject) {
      return false;
    }
    const type = SolidAlgorithmBrushIntersection.classify(subject, peerIndex, prepared, pad, this.membershipEpsilon);
    return type === SolidAlgorithmIntersectionType.Intersection;
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
    const face = subject.brush.faces[faceIndex];
    const facePlane = subject.brush.planes[faceIndex];
    if (!face || !facePlane) return;
    const faceVertices = subject.brush.getFaceVertices(face);
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
