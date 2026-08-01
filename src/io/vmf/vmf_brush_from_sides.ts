import * as THREE from 'three';
import { SolidBrush } from '@/solid/brush/solid_brush.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidPlane } from '@/solid/brush/solid_plane.js';
import { FaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { convertWorldFaceMappingForCenteredBrush } from '@/solid/brush/solid_brush_uv_space.js';
import { VMF_INCHES_TO_METERS, sourcePointToEditorMeters } from './vmf_coordinates.js';
import { HalfSpaceFaceLoop, VmfHalfSpaceHullBuilder } from './vmf_half_space_hull.js';
import { VmfSolid, VmfSolidSide } from './vmf_types.js';
import { VmfUvConverter } from './vmf_uv_converter.js';

/** One imported brush with per-face texture mappings aligned to face order. */
export interface VmfBuiltBrush {
  /** Convex solid brush in editor meters (Y-up), centered at local origin. */
  brush: SolidBrush;
  /** World-space center removed from brush vertices (instance position). */
  worldCenter: THREE.Vector3;
  /** Face mappings indexed like brush.faces / surfaceIndex. */
  faceMappings: FaceTextureMapping[];
  /** Original VMF solid id. */
  solidId: number;
  /** Side materials in face order. */
  materials: string[];
}

/**
 * Plane-on-vertex tolerance for VMF half-spaces in editor meters. Hammer often
 * stores ~0.02 unit noise; at 1/32 scale that is ~0.0006 m, so a slightly
 * looser band is required to keep authored corners.
 */
export const VMF_HULL_PLANE_EPSILON_METERS = 0.002;

/** Builds SolidBrush geometry from VMF solid sides via half-space equations. */
export class VmfBrushFromSides {
  private readonly hullBuilder = new VmfHalfSpaceHullBuilder(VMF_HULL_PLANE_EPSILON_METERS);
  private readonly uvConverter = new VmfUvConverter();

  /**
   * Converts one VMF solid into a convex editor brush.
   *
   * @param solid Parsed VMF solid.
   * @param unitScale Inches to meters.
   * @returns Built brush with mappings, or null when the solid is degenerate.
   */
  build(solid: VmfSolid, unitScale: number = VMF_INCHES_TO_METERS): VmfBuiltBrush | null {
    if (solid.sides.length < 4) {
      return null;
    }
    const planes = solid.sides.map((side) => this.sideToOutwardPlane(side, unitScale));
    const fromPlus = this.tryBuildBrushFromVerticesPlus(solid, planes, unitScale);
    if (fromPlus) {
      return fromPlus;
    }
    return this.tryBuildBrushFromHalfSpaces(solid, planes, unitScale);
  }

  /**
   * Builds a brush from Hammer vertices_plus rings when they form a manifold.
   *
   * @param solid Source solid.
   * @param planes Outward planes in side order.
   * @param unitScale Inches to meters.
   * @returns Built brush, or null when vertices_plus cannot be used.
   */
  private tryBuildBrushFromVerticesPlus(
    solid: VmfSolid,
    planes: SolidPlane[],
    unitScale: number,
  ): VmfBuiltBrush | null {
    const faceLoops = this.tryBuildFaceLoopsFromVerticesPlus(solid, planes, unitScale);
    if (!faceLoops || faceLoops.length < 4) {
      return null;
    }
    const brush = SolidBrushFactory.createFromFaceLoops(faceLoops.map((loop) => loop.vertices));
    if (!brush) {
      return null;
    }
    return this.packageBuiltBrush(solid, brush, planes, faceLoops, unitScale);
  }

  /**
   * Builds a brush from triple-plane intersection hulls.
   *
   * @param solid Source solid.
   * @param planes Outward planes in side order.
   * @param unitScale Inches to meters.
   * @returns Built brush, or null when the hull is degenerate.
   */
  private tryBuildBrushFromHalfSpaces(solid: VmfSolid, planes: SolidPlane[], unitScale: number): VmfBuiltBrush | null {
    const hull = this.hullBuilder.build(planes);
    if (!hull || hull.faceLoops.length < 4) {
      return null;
    }
    const brush = SolidBrushFactory.createFromFaceLoops(hull.faceLoops.map((loop) => loop.vertices));
    if (!brush) {
      return null;
    }
    return this.packageBuiltBrush(solid, brush, planes, hull.faceLoops, unitScale);
  }

  /**
   * Builds face loops from per-side vertices_plus rings. Preserves Hammer ring
   * order (only flips for outward normal) so shared edges keep mutual twins.
   *
   * @param solid Source solid.
   * @param planes Outward planes in side order.
   * @param unitScale Inches to meters.
   * @returns Face loops, or null when vertices_plus is incomplete.
   */
  private tryBuildFaceLoopsFromVerticesPlus(
    solid: VmfSolid,
    planes: SolidPlane[],
    unitScale: number,
  ): HalfSpaceFaceLoop[] | null {
    if (!this.everySideHasVerticesPlus(solid)) {
      return null;
    }
    const loops: HalfSpaceFaceLoop[] = [];
    for (let planeIndex = 0; planeIndex < solid.sides.length; planeIndex++) {
      const side = solid.sides[planeIndex]!;
      const plane = planes[planeIndex]!;
      const editorVerts = side.verticesPlus.map((vertex) => sourcePointToEditorMeters(vertex, unitScale));
      if (editorVerts.length < 3) {
        return null;
      }
      const unique = this.dedupeRingVertices(editorVerts);
      if (unique.length < 3) {
        return null;
      }
      const oriented = this.orientRingOutward(unique, plane);
      loops.push({ planeIndex, vertices: oriented });
    }
    return loops;
  }

  /**
   * Returns whether every side carries a usable vertices_plus ring.
   *
   * @param solid Source solid.
   * @returns True when every side has at least three vertices.
   */
  private everySideHasVerticesPlus(solid: VmfSolid): boolean {
    for (const side of solid.sides) {
      if (!side.verticesPlus || side.verticesPlus.length < 3) {
        return false;
      }
    }
    return true;
  }

  /**
   * Removes consecutive near-duplicate vertices from a face ring.
   *
   * @param vertices Ordered face vertices.
   * @returns Deduplicated ring (may still share the first/last if closed).
   */
  private dedupeRingVertices(vertices: readonly THREE.Vector3[]): THREE.Vector3[] {
    const result: THREE.Vector3[] = [];
    const epsilon = 1e-5;
    for (const vertex of vertices) {
      const previous = result[result.length - 1];
      if (previous && previous.distanceTo(vertex) <= epsilon) {
        continue;
      }
      result.push(vertex.clone());
    }
    if (result.length >= 2) {
      const first = result[0]!;
      const last = result[result.length - 1]!;
      if (first.distanceTo(last) <= epsilon) {
        result.pop();
      }
    }
    return result;
  }

  /**
   * Ensures a face ring is wound so its cross product agrees with the outward
   * plane normal. Keeps Hammer vertex order otherwise so shared edges twin.
   *
   * @param vertices Ordered face vertices.
   * @param plane Outward face plane.
   * @returns Oriented vertex ring.
   */
  private orientRingOutward(vertices: THREE.Vector3[], plane: SolidPlane): THREE.Vector3[] {
    if (vertices.length < 3) {
      return vertices.slice();
    }
    const a = vertices[0]!;
    const b = vertices[1]!;
    const c = vertices[2]!;
    const cross = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (cross.dot(plane.normal) < 0) {
      return vertices.slice().reverse();
    }
    return vertices.slice();
  }

  /**
   * Attaches UV mappings and material names to a constructed brush.
   *
   * @param solid Source VMF solid.
   * @param brush Constructed solid brush.
   * @param planes Outward planes in side order.
   * @param faceLoops Hull face loops with plane indices.
   * @param unitScale Inches to meters.
   * @returns Packaged import result.
   */
  private packageBuiltBrush(
    solid: VmfSolid,
    brush: SolidBrush,
    planes: SolidPlane[],
    faceLoops: Array<{ planeIndex: number }>,
    unitScale: number,
  ): VmfBuiltBrush {
    const planeIndices = faceLoops.map((loop) => loop.planeIndex);
    const worldFaceMappings = planeIndices.map((planeIndex, faceIndex) => {
      const side = solid.sides[planeIndex];
      if (!side) {
        throw new Error(`Missing solid side at plane index ${planeIndex}`);
      }
      return this.mapFace(side, brush, planes, faceIndex, planeIndex, unitScale);
    });
    const materials = planeIndices.map((planeIndex) => {
      const side = solid.sides[planeIndex];
      if (!side) {
        throw new Error(`Missing solid side at plane index ${planeIndex}`);
      }
      return side.material;
    });
    const worldCenter = this.centerBrushAtOrigin(brush);
    const faceMappings = worldFaceMappings.map((mapping) =>
      convertWorldFaceMappingForCenteredBrush(mapping, worldCenter),
    );
    return {
      brush,
      worldCenter,
      faceMappings,
      solidId: solid.id,
      materials,
    };
  }

  /**
   * Translates brush vertices so the AABB center is at the origin.
   *
   * @param brush Brush whose vertices are shifted in place.
   * @returns Former center in editor meters (pre-shift).
   */
  private centerBrushAtOrigin(brush: SolidBrush): THREE.Vector3 {
    const bounds = brush.computeLocalBounds();
    const center = bounds.getCenter(new THREE.Vector3());
    for (const vertex of brush.vertices) {
      vertex.sub(center);
    }
    brush.recalculatePlanes();
    return center;
  }

  /**
   * Builds a face texture mapping for one hull face.
   *
   * @param side Source solid side.
   * @param brush Constructed brush.
   * @param planes Side-order planes.
   * @param faceIndex Brush face index.
   * @param planeIndex Source side index.
   * @param unitScale Unit scale.
   * @returns Face texture mapping.
   */
  private mapFace(
    side: VmfSolidSide,
    brush: SolidBrush,
    planes: SolidPlane[],
    faceIndex: number,
    planeIndex: number,
    unitScale: number,
  ): FaceTextureMapping {
    const plane = brush.planes[faceIndex] ?? planes[planeIndex];
    if (!plane) {
      throw new Error(`Missing plane for face ${faceIndex}`);
    }
    return this.uvConverter.convertSideMapping(
      side.material,
      side.uAxis,
      side.vAxis,
      plane.normal,
      undefined,
      undefined,
      unitScale,
    );
  }

  /**
   * Builds an outward SolidPlane from three Source-space plane points.
   *
   * @param side Solid side with plane points.
   * @param unitScale Inches to meters.
   * @returns Outward plane in editor space.
   */
  private sideToOutwardPlane(side: VmfSolidSide, unitScale: number): SolidPlane {
    const p1 = sourcePointToEditorMeters(side.plane.p1, unitScale);
    const p2 = sourcePointToEditorMeters(side.plane.p2, unitScale);
    const p3 = sourcePointToEditorMeters(side.plane.p3, unitScale);
    return SolidPlane.fromPoints(p1, p2, p3);
  }
}
