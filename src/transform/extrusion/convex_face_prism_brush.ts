import * as THREE from 'three';
import { SolidBrush } from '../../solid/brush/solid_brush.js';
import { SolidBrushFactory } from '../../solid/brush/solid_brush_factory.js';
import { SolidBrushValidator } from '../../solid/brush/solid_brush_validator.js';
import { resolveOrderedWorldFacePolygon } from './convex_face_prism.js';

/** Convex prism brush ready to place under a solid model. */
export interface ConvexPrismBrushPlacement {
  brush: SolidBrush;
  localPosition: THREE.Vector3;
}

/**
 * Builds a convex solid brush by extruding a coplanar face polygon. Geometry is
 * centered in brush-local space; localPosition is relative to spaceRoot (or
 * world when spaceRoot is omitted).
 *
 * @param sourceMesh Mesh that owns the face (world transform applied).
 * @param faceIndices Coplanar triangle indices of the face region.
 * @param distance Signed extrude distance along the face normal.
 * @param spaceRoot Optional parent space (solid model root) for local coords.
 * @returns Centered brush and placement position, or null on failure.
 */
export function createConvexPrismBrushFromFace(
  sourceMesh: THREE.Mesh,
  faceIndices: number[],
  distance: number,
  spaceRoot?: THREE.Object3D,
): ConvexPrismBrushPlacement | null {
  if (Math.abs(distance) < 1e-8) return null;
  const worldFace = resolveOrderedWorldFacePolygon(sourceMesh, faceIndices);
  if (!worldFace) return null;
  const localFace = transformFaceIntoSpace(worldFace.polygon, worldFace.normal, spaceRoot);
  if (!localFace) return null;
  const faceLoops = buildPrismFaceLoops(localFace.polygon, localFace.normal, distance);
  if (!faceLoops) return null;
  const centered = centerFaceLoops(faceLoops);
  const brush = SolidBrushFactory.createFromFaceLoops(centered.loops);
  if (!brush) return null;
  if (!SolidBrushValidator.validate(brush).valid) return null;
  return { brush, localPosition: centered.center };
}

/**
 * Transforms a world-space face polygon and normal into parent local space.
 *
 * @param worldPolygon Ordered world vertices.
 * @param worldNormal Unit world normal.
 * @param spaceRoot Optional parent whose inverse world matrix is applied.
 * @returns Local polygon and normal, or null when the normal degenerates.
 */
function transformFaceIntoSpace(
  worldPolygon: THREE.Vector3[],
  worldNormal: THREE.Vector3,
  spaceRoot?: THREE.Object3D,
): { polygon: THREE.Vector3[]; normal: THREE.Vector3 } | null {
  if (!spaceRoot) {
    return {
      polygon: worldPolygon.map((point) => point.clone()),
      normal: worldNormal.clone(),
    };
  }
  spaceRoot.updateMatrixWorld(true);
  const inverse = spaceRoot.matrixWorld.clone().invert();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(inverse);
  const polygon = worldPolygon.map((point) => point.clone().applyMatrix4(inverse));
  const normal = worldNormal.clone().applyMatrix3(normalMatrix).normalize();
  if (normal.lengthSq() < 1e-10) return null;
  return { polygon, normal };
}

/**
 * Builds outward-wound face loops for a convex extrusion prism.
 *
 * @param basePolygon Ordered base polygon (CCW along normal).
 * @param normal Unit extrusion axis.
 * @param distance Signed extrusion distance along normal.
 * @returns Face loops (base, top, sides), or null when invalid.
 */
function buildPrismFaceLoops(
  basePolygon: THREE.Vector3[],
  normal: THREE.Vector3,
  distance: number,
): THREE.Vector3[][] | null {
  if (basePolygon.length < 3) return null;
  const offset = normal.clone().multiplyScalar(distance);
  const topPolygon = basePolygon.map((point) => point.clone().add(offset));
  const baseFace = reversePolygon(basePolygon);
  const topFace = topPolygon.map((point) => point.clone());
  const sideFaces = buildPrismSideLoops(basePolygon, topPolygon);
  return [baseFace, topFace, ...sideFaces];
}

/**
 * Builds side-face loops between base and top rings.
 *
 * @param basePolygon Ordered base ring (CCW along extrude normal).
 * @param topPolygon Matching top ring.
 * @returns One quad loop per edge.
 */
function buildPrismSideLoops(basePolygon: THREE.Vector3[], topPolygon: THREE.Vector3[]): THREE.Vector3[][] {
  const sides: THREE.Vector3[][] = [];
  const count = basePolygon.length;
  for (let index = 0; index < count; index++) {
    const next = (index + 1) % count;
    sides.push([
      basePolygon[index]!.clone(),
      basePolygon[next]!.clone(),
      topPolygon[next]!.clone(),
      topPolygon[index]!.clone(),
    ]);
  }
  return sides;
}

/**
 * Centers face-loop vertices about their centroid.
 *
 * @param faceLoops Prism face loops in placement space.
 * @returns Loops translated to origin and the previous centroid.
 */
function centerFaceLoops(faceLoops: THREE.Vector3[][]): { loops: THREE.Vector3[][]; center: THREE.Vector3 } {
  const center = computeLoopsCentroid(faceLoops);
  const loops = faceLoops.map((loop) => loop.map((point) => point.clone().sub(center)));
  return { loops, center };
}

/**
 * Averages all unique-ish vertices across face loops.
 *
 * @param faceLoops Face vertex rings.
 * @returns Centroid vector.
 */
function computeLoopsCentroid(faceLoops: THREE.Vector3[][]): THREE.Vector3 {
  const centroid = new THREE.Vector3();
  let count = 0;
  faceLoops.forEach((loop) => {
    loop.forEach((point) => {
      centroid.add(point);
      count += 1;
    });
  });
  return centroid.multiplyScalar(1 / Math.max(count, 1));
}

/**
 * Returns a reversed copy of a polygon ring.
 *
 * @param polygon Ordered vertices.
 * @returns Reversed clone.
 */
function reversePolygon(polygon: THREE.Vector3[]): THREE.Vector3[] {
  return polygon
    .slice()
    .reverse()
    .map((point) => point.clone());
}
