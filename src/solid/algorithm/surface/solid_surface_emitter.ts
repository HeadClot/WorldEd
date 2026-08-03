import * as THREE from 'three';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { SOLID_BOUNDS_EPSILON } from '@/solid/algorithm/math/solid_math_constants.js';
import { SolidPlaneBounds } from '@/solid/algorithm/math/solid_plane_bounds.js';
import { SolidPlaneBoundsResult } from '@/solid/algorithm/math/solid_plane_bounds_result.js';
import { boundsOverlapPadded } from '@/solid/algorithm/spatial/bounds_overlap.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidCompiledPolygon } from '@/solid/algorithm/compile/solid_compiled_polygon.js';
import { SolidFragmentFinalizer } from '@/solid/algorithm/compile/solid_fragment_finalizer.js';
import { SolidAlgorithmRoutingPeers } from '@/solid/algorithm/routing/solid_algorithm_routing_peers.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';
import { SolidAlgorithmBrushPairLocalTable } from '@/solid/algorithm/spatial/solid_algorithm_brush_pair_local_table.js';
import { HashedVertexTable } from '@/solid/algorithm/spatial/hashed_vertex_table.js';
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
  private readonly brushVertexTable = new HashedVertexTable();

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
    this.brushVertexTable.clear();
    const pairLocalTable = SolidAlgorithmBrushPairLocalTable.buildForSubject(
      prepared,
      brushIndex,
      SOLID_BOUNDS_EPSILON,
      this.membershipEpsilon,
      this.membershipEpsilon,
    );
    for (let faceIndex = 0; faceIndex < subject.brush.faces.length; faceIndex++) {
      this.compileBrushFace(prepared, brushIndex, faceIndex, pairLocalTable, output);
    }
  }

  /**
   * Compiles a single face of a brush into surface fragments.
   *
   * @param prepared All prepared brushes.
   * @param brushIndex Subject brush index.
   * @param faceIndex Face index on the subject brush.
   * @param pairLocalTable Precomputed subject/peer local plane tables.
   * @param output Polygon accumulator.
   */
  compileBrushFace(
    prepared: PreparedBrush[],
    brushIndex: number,
    faceIndex: number,
    pairLocalTable: SolidAlgorithmBrushPairLocalTable,
    output: SolidCompiledPolygon[],
  ): void {
    const subject = prepared[brushIndex];
    if (!subject) return;
    const face = subject.brush.faces[faceIndex];
    const facePlane = subject.brush.planes[faceIndex];
    if (!face || !facePlane) return;
    const faceVertices = subject.brush.getFaceVertices(face);
    const cutResult = this.collectCutPlanes(prepared, brushIndex, facePlane, faceVertices, pairLocalTable);
    const fragments = this.splitFaceFragments(faceVertices, cutResult.planes);
    this.finalizeFaceFragments(
      fragments,
      facePlane,
      face.surfaceIndex,
      subject,
      prepared,
      brushIndex,
      cutResult.interactionPeerIndices,
      output,
    );
  }

  /**
   * Fast path for a brush that does not overlap any peer volume. Non-inverted
   * subtractive and intersecting brushes contribute no solid when isolated,
   * even under hierarchical CSG trees.
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
    if (!this.invertedWorld && this.operationContributesNoIsolatedSolid(subject.operation)) {
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
   * Returns whether an operation emits no solid surface when the brush has no
   * overlapping peers and the world is not inverted.
   *
   * @param operation Brush CSG operation.
   * @returns True for subtractive and intersecting operations.
   */
  private operationContributesNoIsolatedSolid(operation: SolidOperation): boolean {
    return operation === SolidOperation.Subtractive || operation === SolidOperation.Intersecting;
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
   * Intersection pairs. Peer planes come from the precomputed brush-local
   * GetIntersectingPlanes table (PrepareBrushPairIntersections), not a per-face
   * recompute.
   *
   * @param prepared All brushes.
   * @param subjectIndex Subject brush index.
   * @param facePlane Subject face plane.
   * @param faceVertices Subject face vertices.
   * @param pairLocalTable Precomputed subject/peer local tables.
   * @returns Cut planes and peers that produce a surface interaction loop on
   *   this face (PerformCSG intersectionLoops presence).
   */
  collectCutPlanes(
    prepared: PreparedBrush[],
    subjectIndex: number,
    facePlane: SolidPlane,
    faceVertices: THREE.Vector3[],
    pairLocalTable: SolidAlgorithmBrushPairLocalTable,
  ): { planes: SolidPlane[]; interactionPeerIndices: ReadonlySet<number> } {
    const planes: SolidPlane[] = [];
    const interactionPeerIndices = new Set<number>();
    const subject = prepared[subjectIndex];
    if (!subject) {
      return { planes, interactionPeerIndices };
    }
    this.fillFaceBounds(faceVertices);
    const pad = SOLID_BOUNDS_EPSILON;
    for (const peerIndex of subject.overlappingPeerIndices) {
      if (!SolidAlgorithmRoutingPeers.peerBelongsInSubjectTable(prepared, subjectIndex, peerIndex)) {
        continue;
      }
      const peer = prepared[peerIndex];
      const pairEntry = pairLocalTable.get(peerIndex);
      if (!peer || !pairEntry) {
        continue;
      }
      if (pairEntry.type !== SolidAlgorithmIntersectionType.Intersection) {
        continue;
      }
      if (!boundsOverlapPadded(this.scratchFaceBounds, peer.bounds, pad)) {
        continue;
      }
      const beforeCount = planes.length;
      this.collectPeerCutPlanesFromLocalTable(pairEntry.peerCutPlanes, facePlane, faceVertices, planes);
      if (planes.length > beforeCount) {
        interactionPeerIndices.add(peerIndex);
      }
    }
    return { planes, interactionPeerIndices };
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
   * Returns whether a plane straddles a polygon (may produce a cut). Uses the
   * shared tight cut epsilon, not the fat membership band.
   *
   * @param polygon Face or fragment vertices.
   * @param plane Candidate cut plane.
   * @returns True when the plane may split the polygon.
   */
  planeLikelyCutsPolygon(polygon: THREE.Vector3[], plane: SolidPlane): boolean {
    return SurfaceFragmentSplitter.planeLikelyCutsPolygon(polygon, plane);
  }

  /**
   * Splits face vertices by cut planes when any exist, welding clip points
   * through the per-brush vertex table.
   *
   * @param faceVertices Original face vertices.
   * @param cutPlanes Planes that may cut the face.
   * @returns Fragment polygons.
   */
  private splitFaceFragments(faceVertices: THREE.Vector3[], cutPlanes: SolidPlane[]): THREE.Vector3[][] {
    if (cutPlanes.length === 0) {
      return [faceVertices];
    }
    return SurfaceFragmentSplitter.splitByPlanes(faceVertices, cutPlanes, this.brushVertexTable);
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
   * @param interactionPeerIndices Peers with a surface loop on this face.
   * @param output Polygon accumulator.
   */
  private finalizeFaceFragments(
    fragments: THREE.Vector3[][],
    facePlane: SolidPlane,
    surfaceIndex: number,
    subject: PreparedBrush,
    prepared: PreparedBrush[],
    brushIndex: number,
    interactionPeerIndices: ReadonlySet<number>,
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
        interactionPeerIndices,
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
   * Appends cut planes from a peer's precomputed local intersecting-plane
   * table, with face-bounds and polygon straddle early outs.
   *
   * @param localPlanes Peer planes from GetIntersectingPlanes for this pair.
   * @param facePlane Subject face plane.
   * @param faceVertices Subject face vertices.
   * @param planes Accumulator for cut planes.
   */
  private collectPeerCutPlanesFromLocalTable(
    localPlanes: readonly SolidPlane[],
    facePlane: SolidPlane,
    faceVertices: THREE.Vector3[],
    planes: SolidPlane[],
  ): void {
    if (localPlanes.length === 0) {
      return;
    }
    for (const plane of localPlanes) {
      if (facePlane.isAlignedWith(plane) || facePlane.isReverseAlignedWith(plane)) {
        continue;
      }
      const faceBoundsSide = SolidPlaneBounds.classifyFat(plane, this.scratchFaceBounds);
      if (faceBoundsSide !== SolidPlaneBoundsResult.Intersecting) {
        continue;
      }
      if (!this.planeLikelyCutsPolygon(faceVertices, plane)) {
        continue;
      }
      planes.push(plane);
    }
  }
}
