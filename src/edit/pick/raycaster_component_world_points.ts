import * as THREE from 'three';
import {
  distancePointToSegment2d,
  pointerEventToPickPixels,
  projectWorldPointToPickPixels,
  resolveEditComponentPickElementMetrics,
} from './edit_component_screen_metrics.js';
import { isWorldPointUnoccluded } from './edit_component_occlusion.js';

/**
 * Picks the nearest world-space point projected near the pointer.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element for NDC.
 * @param worldPoints Candidate world positions.
 * @param pixelRadius Max CSS-pixel distance.
 * @returns Closest index and distance, or null.
 */
export function pickNearestWorldPointIndex(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  worldPoints: readonly THREE.Vector3[],
  pixelRadius: number,
): { index: number; screenDistance: number } | null {
  return pickNearestWorldPointIndexFiltered(event, camera, pickElement, worldPoints, pixelRadius, () => true);
}

/**
 * Picks the nearest unoccluded world-space point near the pointer.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element for NDC.
 * @param worldPoints Candidate world positions.
 * @param pixelRadius Max CSS-pixel distance.
 * @param occluders Domain meshes that block hidden components.
 * @returns Closest visible index and distance, or null.
 */
export function pickNearestUnoccludedWorldPointIndex(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  worldPoints: readonly THREE.Vector3[],
  pixelRadius: number,
  occluders: readonly THREE.Mesh[],
): { index: number; screenDistance: number } | null {
  return pickNearestWorldPointIndexFiltered(event, camera, pickElement, worldPoints, pixelRadius, (point) =>
    isWorldPointUnoccluded(point, camera, occluders),
  );
}

/**
 * Picks the nearest projected world point that passes a visibility filter.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param worldPoints Candidates.
 * @param pixelRadius Max screen distance.
 * @param isVisible Filter; false skips the candidate.
 * @returns Closest accepted index, or null.
 */
function pickNearestWorldPointIndexFiltered(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  worldPoints: readonly THREE.Vector3[],
  pixelRadius: number,
  isVisible: (point: THREE.Vector3) => boolean,
): { index: number; screenDistance: number } | null {
  camera.updateMatrixWorld(true);
  const metrics = resolveEditComponentPickElementMetrics(pickElement);
  const pointerPixels = pointerEventToPickPixels(event, pickElement, metrics);
  const projectedPixels = new THREE.Vector2();
  let bestIndex = -1;
  let bestDistance = pixelRadius;
  for (let index = 0; index < worldPoints.length; index++) {
    const worldPoint = worldPoints[index]!;
    const projected = projectWorldPointToPickPixels(worldPoint, camera, metrics, projectedPixels);
    if (!projected) {
      continue;
    }
    const screenDistance = Math.hypot(projected.x - pointerPixels.x, projected.y - pointerPixels.y);
    if (screenDistance > bestDistance) {
      continue;
    }
    if (!isVisible(worldPoint)) {
      continue;
    }
    bestDistance = screenDistance;
    bestIndex = index;
  }
  if (bestIndex < 0) {
    return null;
  }
  return { index: bestIndex, screenDistance: bestDistance };
}

/**
 * Returns the world-space point on a segment that is nearest the pointer in
 * screen space (for edge occlusion sampling).
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param worldA Segment start.
 * @param worldB Segment end.
 * @returns World sample on the segment, or null when both ends are off-screen.
 */
export function closestWorldPointOnSegmentToPointer(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
): THREE.Vector3 | null {
  camera.updateMatrixWorld(true);
  const metrics = resolveEditComponentPickElementMetrics(pickElement);
  const pointerPixels = pointerEventToPickPixels(event, pickElement, metrics);
  const a = projectWorldPointToPickPixels(worldA, camera, metrics);
  const b = projectWorldPointToPickPixels(worldB, camera, metrics);
  if (!a && !b) {
    return null;
  }
  const ax = a?.x ?? b!.x;
  const ay = a?.y ?? b!.y;
  const bx = b?.x ?? a!.x;
  const by = b?.y ?? a!.y;
  const t = closestParameterOnSegment2d(pointerPixels.x, pointerPixels.y, ax, ay, bx, by);
  return worldA.clone().lerp(worldB, t);
}

/**
 * Parameter t in [0,1] of the closest point on a 2D segment to a point.
 *
 * @param px Point X.
 * @param py Point Y.
 * @param ax Segment A X.
 * @param ay Segment A Y.
 * @param bx Segment B X.
 * @param by Segment B Y.
 * @returns Segment parameter.
 */
function closestParameterOnSegment2d(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq <= 1e-12) {
    return 0;
  }
  let t = ((px - ax) * abx + (py - ay) * aby) / lengthSq;
  return Math.max(0, Math.min(1, t));
}

/**
 * Distance from pointer to a world segment in CSS pixels.
 *
 * @param event Pointer event.
 * @param camera Camera.
 * @param pickElement Pick element.
 * @param worldA Segment start.
 * @param worldB Segment end.
 * @returns Distance, or null when both ends are behind the camera.
 */
export function measureWorldSegmentScreenDistance(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  worldA: THREE.Vector3,
  worldB: THREE.Vector3,
): number | null {
  camera.updateMatrixWorld(true);
  const metrics = resolveEditComponentPickElementMetrics(pickElement);
  const pointerPixels = pointerEventToPickPixels(event, pickElement, metrics);
  const a = projectWorldPointToPickPixels(worldA, camera, metrics);
  const b = projectWorldPointToPickPixels(worldB, camera, metrics);
  if (!a && !b) {
    return null;
  }
  const ax = a?.x ?? b!.x;
  const ay = a?.y ?? b!.y;
  const bx = b?.x ?? a!.x;
  const by = b?.y ?? a!.y;
  return distancePointToSegment2d(pointerPixels.x, pointerPixels.y, ax, ay, bx, by);
}
