import * as THREE from 'three';
import { CsgClipper } from '@/csg/csg_clipper.js';
import { BuilderCsgMesh } from '@/csg/builder_csg_mesh.js';
import { CsgPolygon } from '@/csg/csg_polygon.js';
import { buildPlaneCapPolygon } from '@/csg/csg_plane_cap.js';
import { planeToCsgForm } from '@/csg/csg_plane_from_points.js';
import { getTriangleCount } from '@/selection/pick/utils_triangle_geometry.js';
import { Theme } from '@/theme.js';
import { CLIP_PREVIEW_USERDATA_KEY } from './clip_plane_preview_keys.js';

/** UserData marking the keep half of a clip preview. */
export const CLIP_HALF_KEEP_USERDATA_KEY = 'isClipKeepHalf';

/** UserData marking the discard half of a clip preview. */
export const CLIP_HALF_DISCARD_USERDATA_KEY = 'isClipDiscardHalf';

/**
 * Skip full half-mesh rebuilds above this triangle count so dragging stays
 * interactive on dense CSG results (silhouette lines still draw).
 */
const MAX_HALF_PREVIEW_TRIANGLES = 6000;

/** Keep-side fill opacity (muted remainder, not neon). */
const KEEP_OPACITY = 0.3;

/** Discard-side fill opacity (stronger ghost so red actually reads). */
const DISCARD_OPACITY = 0.28;

/**
 * Pull each half slightly into its own side of the plane so the two cut caps
 * are not coplanar (stops z-fighting). Applied identically to keep and
 * discard.
 */
const HALF_NORMAL_BIAS = 0.0015;

/** Shared CSG helpers reused across preview rebuilds. */
const sharedMeshBuilder = new BuilderCsgMesh();
const sharedClipper = new CsgClipper();

/**
 * Builds lightweight keep/discard half meshes for one source target. Both
 * halves are closed (capped) solids built the same way; only color, opacity,
 * and opposite normal bias differ.
 *
 * @param sourceMesh Selected mesh to preview-clip.
 * @param plane World clip plane.
 * @param keepFront Whether the front half-space is the keep side.
 * @returns Keep and discard preview meshes (either may be null).
 */
export function buildClipHalfPreviewPair(
  sourceMesh: THREE.Mesh,
  plane: THREE.Plane,
  keepFront: boolean,
): { keepMesh: THREE.Mesh | null; discardMesh: THREE.Mesh | null } {
  if (!canBuildHalfPreview(sourceMesh)) {
    return { keepMesh: null, discardMesh: null };
  }
  sourceMesh.updateMatrixWorld(true);
  const sourcePolygons = sharedMeshBuilder.meshToPolygons(sourceMesh);
  if (sourcePolygons.length === 0) {
    return { keepMesh: null, discardMesh: null };
  }
  const keepBias = resolveKeepBiasDirection(plane, keepFront);
  const keepMesh = buildHalfMesh(
    sourcePolygons,
    plane,
    keepFront,
    Theme.clipKeepColor,
    KEEP_OPACITY,
    CLIP_HALF_KEEP_USERDATA_KEY,
  );
  const discardMesh = buildHalfMesh(
    sourcePolygons,
    plane,
    !keepFront,
    Theme.clipDiscardColor,
    DISCARD_OPACITY,
    CLIP_HALF_DISCARD_USERDATA_KEY,
  );
  if (keepMesh) keepMesh.position.addScaledVector(keepBias, HALF_NORMAL_BIAS);
  if (discardMesh) discardMesh.position.addScaledVector(keepBias, -HALF_NORMAL_BIAS);
  return { keepMesh, discardMesh };
}

/**
 * Builds one capped half preview mesh for a CSG side.
 *
 * @param sourcePolygons World-space source polygons.
 * @param plane Cutting plane.
 * @param keepFront Whether this half is the CSG front side.
 * @param color Fill color.
 * @param opacity Fill opacity.
 * @param kindKey UserData kind flag.
 * @returns Preview mesh, or null when that side is empty.
 */
function buildHalfMesh(
  sourcePolygons: CsgPolygon[],
  plane: THREE.Plane,
  keepFront: boolean,
  color: number,
  opacity: number,
  kindKey: string,
): THREE.Mesh | null {
  const polygons = buildCappedHalf(sourcePolygons, plane, keepFront);
  return polygonsToPreviewMesh(polygons, color, opacity, kindKey);
}

/**
 * Returns whether a mesh is cheap enough for live half-mesh preview.
 *
 * @param mesh Candidate mesh.
 * @returns True when half previews should be built.
 */
function canBuildHalfPreview(mesh: THREE.Mesh): boolean {
  const geometry = mesh.geometry;
  if (!(geometry instanceof THREE.BufferGeometry)) return false;
  return getTriangleCount(geometry) <= MAX_HALF_PREVIEW_TRIANGLES;
}

/**
 * Unit direction pointing into the keep half-space along the plane normal.
 *
 * @param plane World clip plane.
 * @param keepFront Whether front is kept.
 * @returns Unit bias direction for the keep mesh.
 */
function resolveKeepBiasDirection(plane: THREE.Plane, keepFront: boolean): THREE.Vector3 {
  const direction = plane.normal.clone().normalize();
  if (!keepFront) direction.negate();
  return direction;
}

/**
 * Clips source polygons to one half-space and caps the cut.
 *
 * @param sourcePolygons World-space source polygons.
 * @param plane Cutting plane.
 * @param keepFront Whether to keep the CSG front half-space.
 * @returns Capped polygons, or empty when that side is void.
 */
function buildCappedHalf(sourcePolygons: CsgPolygon[], plane: THREE.Plane, keepFront: boolean): CsgPolygon[] {
  const csgPlane = planeToCsgForm(plane);
  const clipped = clipToSide(sourcePolygons, csgPlane.normal, csgPlane.constant, keepFront);
  if (clipped.length === 0) return [];
  const outward = keepFront ? csgPlane.normal.clone().negate() : csgPlane.normal.clone();
  const cap = buildPlaneCapPolygon(sourcePolygons, csgPlane.normal, csgPlane.constant, outward);
  return cap ? [...clipped, cap] : clipped;
}

/**
 * Clips polygons to the front or back half-space.
 *
 * @param polygons Source polygons.
 * @param planeNormal CSG plane normal.
 * @param planeConstant CSG plane constant.
 * @param keepFront Whether to keep the front side.
 * @returns Clipped polygons without a cap.
 */
function clipToSide(
  polygons: CsgPolygon[],
  planeNormal: THREE.Vector3,
  planeConstant: number,
  keepFront: boolean,
): CsgPolygon[] {
  if (keepFront) {
    return sharedClipper.clipPolygonsToFront(polygons, planeNormal, planeConstant);
  }
  return sharedClipper.clipPolygonsToFront(polygons, planeNormal.clone().negate(), -planeConstant);
}

/**
 * Fan-triangulates polygons into a transparent overlay mesh without textures.
 * Depth test is disabled so the preview never z-fights the live mesh.
 *
 * @param polygons Half-space polygons.
 * @param color Fill color.
 * @param opacity Material opacity.
 * @param kindKey UserData kind flag.
 * @returns Preview mesh, or null when empty.
 */
function polygonsToPreviewMesh(
  polygons: CsgPolygon[],
  color: number,
  opacity: number,
  kindKey: string,
): THREE.Mesh | null {
  if (polygons.length === 0) return null;
  const positions: number[] = [];
  polygons.forEach((polygon) => appendFanTriangles(polygon.getVertices(), positions));
  if (positions.length < 9) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData[CLIP_PREVIEW_USERDATA_KEY] = true;
  mesh.userData[kindKey] = true;
  mesh.renderOrder = 980;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * Appends fan-triangulated positions for one polygon.
 *
 * @param vertices Polygon vertices in winding order.
 * @param positions Output xyz list.
 */
function appendFanTriangles(vertices: THREE.Vector3[], positions: number[]): void {
  for (let i = 1; i + 1 < vertices.length; i++) {
    const first = vertices[0]!;
    const second = vertices[i]!;
    const third = vertices[i + 1]!;
    positions.push(first.x, first.y, first.z, second.x, second.y, second.z, third.x, third.y, third.z);
  }
}
