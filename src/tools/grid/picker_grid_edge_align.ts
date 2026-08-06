import * as THREE from 'three';
import { hasEdgeBuildableGeometry } from '@/utils/mesh_edge_sync.js';
import { readPersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import {
  forEachMeshOutlineEdgeLocalSegment,
  getOrBuildMeshOutlineEdgeLocalPositions,
} from '@/utils/mesh_outline_edge_segments.js';
import { closestPointOnSegmentToRay } from '@/utils/ray_segment_closest.js';
import {
  distancePointToSegment2d,
  pointerEventToPickPixels,
  projectWorldPointToPickPixels,
  resolveEditComponentPickElementMetrics,
  type EditComponentPickElementMetrics,
} from '@/edit/pick/edit_component_screen_metrics.js';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';

/** Result of a world-space mesh edge pick for grid axis align. */
export interface GridEdgePickResult {
  pointA: THREE.Vector3;
  pointB: THREE.Vector3;
  /**
   * World point on the edge nearest the pointer ray (follows the cursor under
   * perspective, not a screen-lerp of the endpoints).
   */
  closestPoint: THREE.Vector3;
  direction: THREE.Vector3;
}

/**
 * Returns the edge endpoint nearer the pointer's closest point on the edge.
 * Used as the implicit Zero Origin vertex when committing Align X/Y/Z.
 *
 * @param edge Edge pick result.
 * @returns World position of the nearer endpoint (shared reference, do not
 *   mutate).
 */
export function resolveNearestEdgeEndpointForOrigin(edge: GridEdgePickResult): THREE.Vector3 {
  const distanceToA = edge.closestPoint.distanceToSquared(edge.pointA);
  const distanceToB = edge.closestPoint.distanceToSquared(edge.pointB);
  return distanceToA <= distanceToB ? edge.pointA : edge.pointB;
}

/** Default max screen distance in CSS pixels for edge hover/pick. */
const DEFAULT_EDGE_PIXEL_RADIUS = 14;

const scratchLocalA = new THREE.Vector3();
const scratchLocalB = new THREE.Vector3();
const scratchWorldA = new THREE.Vector3();
const scratchWorldB = new THREE.Vector3();
const scratchClosest = new THREE.Vector3();
const scratchNdc = new THREE.Vector2();
const scratchRay = new THREE.Raycaster();

/**
 * Picks the nearest outline mesh edge under the pointer for grid axis align.
 * Uses n-gon MeshDocument edges when present, otherwise hard outline edges
 * (same threshold as brush/content wireframes). Triangle diagonals are never
 * pickable.
 */
export class PickerGridEdgeAlign {
  /**
   * Picks the closest screen-projected outline edge under the pointer.
   *
   * @param event Pointer or mouse event.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   * @param worldObject World hierarchy root.
   * @param pixelRadius Max screen distance in CSS pixels.
   * @returns Edge pick result, or null when nothing was near enough.
   */
  pickEdge(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    worldObject: THREE.Object3D,
    pixelRadius: number = DEFAULT_EDGE_PIXEL_RADIUS,
  ): GridEdgePickResult | null {
    camera.updateMatrixWorld(true);
    const metrics = resolveEditComponentPickElementMetrics(pickElement);
    const pointerPixels = pointerEventToPickPixels(event, pickElement, metrics);
    const pickRay = this.buildPickRay(event, camera, pickElement);
    let best: GridEdgePickResult | null = null;
    let bestDistance = pixelRadius;
    for (const mesh of this.collectPickableMeshes(worldObject)) {
      const hit = this.pickClosestOutlineEdgeOnMesh(mesh, camera, metrics, pointerPixels, pickRay, bestDistance);
      if (!hit) {
        continue;
      }
      bestDistance = hit.screenDistance;
      best = hit.result;
    }
    return best;
  }

  /**
   * Builds a world-space pick ray through the pointer.
   *
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param pickElement Pick element for NDC.
   * @returns Ray from the camera through the pointer.
   */
  private buildPickRay(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): THREE.Ray {
    pointerEventToNdc(event, pickElement, scratchNdc);
    scratchRay.setFromCamera(scratchNdc, camera);
    return scratchRay.ray;
  }

  /**
   * Collects meshes eligible for edge align picks. Includes content, solid
   * results, and solid brush hulls. Skips selection/gizmo/overlay helpers.
   *
   * @param worldObject World hierarchy root.
   * @returns Pickable meshes.
   */
  private collectPickableMeshes(worldObject: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    worldObject.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return;
      }
      if (!isGridEdgeAlignPickableMesh(child)) {
        return;
      }
      meshes.push(child);
    });
    return meshes;
  }

  /**
   * Finds the closest outline edge on one mesh.
   *
   * @param mesh Mesh to search.
   * @param camera Camera.
   * @param metrics Pick element metrics.
   * @param pointerPixels Pointer in CSS pixels.
   * @param pickRay World pick ray through the pointer.
   * @param bestDistance Current best screen distance.
   * @returns Hit with distance, or null.
   */
  private pickClosestOutlineEdgeOnMesh(
    mesh: THREE.Mesh,
    camera: THREE.Camera,
    metrics: EditComponentPickElementMetrics,
    pointerPixels: THREE.Vector2,
    pickRay: THREE.Ray,
    bestDistance: number,
  ): { result: GridEdgePickResult; screenDistance: number } | null {
    const localPositions = getOrBuildMeshOutlineEdgeLocalPositions(mesh);
    if (!localPositions) {
      return null;
    }
    mesh.updateMatrixWorld(true);
    let best: { result: GridEdgePickResult; screenDistance: number } | null = null;
    let limit = bestDistance;
    forEachMeshOutlineEdgeLocalSegment(localPositions, (ax, ay, az, bx, by, bz) => {
      const hit = this.measureWorldEdgeFromLocal(mesh, ax, ay, az, bx, by, bz, camera, metrics, pointerPixels, pickRay);
      if (!hit || hit.screenDistance > limit) {
        return;
      }
      limit = hit.screenDistance;
      best = hit;
    });
    return best;
  }

  /**
   * Measures screen distance for ranking and ray–segment closest point for the
   * preview origin.
   *
   * @param mesh Mesh owning the edge.
   * @param ax Local start X.
   * @param ay Local start Y.
   * @param az Local start Z.
   * @param bx Local end X.
   * @param by Local end Y.
   * @param bz Local end Z.
   * @param camera Camera.
   * @param metrics Pick metrics.
   * @param pointerPixels Pointer pixels.
   * @param pickRay World pick ray through the pointer.
   * @returns Edge hit with distance, or null when degenerate or behind camera.
   */
  private measureWorldEdgeFromLocal(
    mesh: THREE.Mesh,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    camera: THREE.Camera,
    metrics: EditComponentPickElementMetrics,
    pointerPixels: THREE.Vector2,
    pickRay: THREE.Ray,
  ): { result: GridEdgePickResult; screenDistance: number } | null {
    scratchLocalA.set(ax, ay, az);
    scratchLocalB.set(bx, by, bz);
    scratchWorldA.copy(scratchLocalA).applyMatrix4(mesh.matrixWorld);
    scratchWorldB.copy(scratchLocalB).applyMatrix4(mesh.matrixWorld);
    const screenDistance = this.measureEdgeScreenDistance(scratchWorldA, scratchWorldB, camera, metrics, pointerPixels);
    if (screenDistance === null) {
      return null;
    }
    const direction = new THREE.Vector3().subVectors(scratchWorldB, scratchWorldA);
    if (direction.lengthSq() < 1e-20) {
      return null;
    }
    closestPointOnSegmentToRay(scratchWorldA, scratchWorldB, pickRay.origin, pickRay.direction, scratchClosest);
    const pointA = scratchWorldA.clone();
    const pointB = scratchWorldB.clone();
    return {
      screenDistance,
      result: {
        pointA,
        pointB,
        closestPoint: scratchClosest.clone(),
        direction,
      },
    };
  }

  /**
   * Returns screen-pixel distance from the pointer to the projected edge, or
   * null when both endpoints are outside the clip volume.
   *
   * @param worldA Edge start.
   * @param worldB Edge end.
   * @param camera Camera.
   * @param metrics Pick metrics.
   * @param pointerPixels Pointer pixels.
   * @returns Screen distance, or null.
   */
  private measureEdgeScreenDistance(
    worldA: THREE.Vector3,
    worldB: THREE.Vector3,
    camera: THREE.Camera,
    metrics: EditComponentPickElementMetrics,
    pointerPixels: THREE.Vector2,
  ): number | null {
    const projectedA = projectWorldPointToPickPixels(worldA, camera, metrics);
    const projectedB = projectWorldPointToPickPixels(worldB, camera, metrics);
    if (!projectedA && !projectedB) {
      return null;
    }
    const screenAx = projectedA?.x ?? projectedB!.x;
    const screenAy = projectedA?.y ?? projectedB!.y;
    const screenBx = projectedB?.x ?? projectedA!.x;
    const screenBy = projectedB?.y ?? projectedA!.y;
    return distancePointToSegment2d(pointerPixels.x, pointerPixels.y, screenAx, screenAy, screenBx, screenBy);
  }
}

/**
 * Returns whether a mesh may contribute outline edges for grid axis align.
 *
 * @param mesh Candidate mesh.
 * @returns True for content, solid results, solid brushes with outline data.
 */
function isGridEdgeAlignPickableMesh(mesh: THREE.Mesh): boolean {
  if (hasGridEdgeAlignExemptUserData(mesh)) {
    return false;
  }
  if (readPersistentMeshDocument(mesh)) {
    return true;
  }
  return hasEdgeBuildableGeometry(mesh);
}

/**
 * Returns whether mesh userData marks a non-content helper.
 *
 * @param mesh Candidate mesh.
 * @returns True when the mesh must not be edge-picked.
 */
function hasGridEdgeAlignExemptUserData(mesh: THREE.Mesh): boolean {
  const data = mesh.userData;
  if (data['isSelectionHighlight'] === true) return true;
  if (data['isWireframeOverlay'] === true) return true;
  if (data['isFaceSelectionHighlight'] === true) return true;
  if (data['isClipPlanePreview'] === true) return true;
  if (data['isBoundsFacePick'] === true) return true;
  if (data['isGizmoOccludedGhost'] === true) return true;
  if (data['isCadRuler'] === true) return true;
  if (data['handleId'] !== undefined) return true;
  return false;
}
