import * as THREE from 'three';
import type { MeshDocument } from '@/mesh/document/mesh_document.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import {
  pointerEventToPickPixels,
  projectWorldPointToPickPixels,
  resolveEditComponentPickElementMetrics,
} from './edit_component_screen_metrics.js';

/** Result of a vertex pick in Edit Mode. */
export interface ComponentVertexPickResult {
  targetId: string;
  vertexIndex: number;
  worldPoint: THREE.Vector3;
}

/** One mesh candidate for vertex picking. */
export interface ComponentVertexPickCandidate {
  targetId: string;
  mesh: THREE.Mesh;
  document: MeshDocument;
}

/**
 * Picks the nearest document vertex projected near the pointer.
 *
 * @param event Pointer or mouse event.
 * @param camera Active camera.
 * @param pickElement Element providing size for NDC.
 * @param candidates Domain content meshes with documents.
 * @param pixelRadius Max screen distance in CSS pixels.
 * @returns Closest vertex pick, or null.
 */
export function pickComponentVertex(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  candidates: readonly ComponentVertexPickCandidate[],
  pixelRadius: number = 64,
): ComponentVertexPickResult | null {
  camera.updateMatrixWorld(true);
  const metrics = resolveEditComponentPickElementMetrics(pickElement);
  const pointerPixels = pointerEventToPickPixels(event, pickElement, metrics);
  let best: ComponentVertexPickResult | null = null;
  let bestDistance = pixelRadius;
  const worldPoint = new THREE.Vector3();
  const projectedPixels = new THREE.Vector2();
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  for (const candidate of candidates) {
    const positions = candidate.document.getTopology().getPositions();
    const vertexCount = candidate.document.getTopology().getVertexCount();
    candidate.mesh.updateMatrixWorld(true);
    for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
      meshVertexPositionRead(positions, vertexIndex, scratch);
      worldPoint.set(scratch[0], scratch[1], scratch[2]).applyMatrix4(candidate.mesh.matrixWorld);
      const projected = projectWorldPointToPickPixels(worldPoint, camera, metrics, projectedPixels);
      if (!projected) {
        continue;
      }
      const screenDistance = Math.hypot(projected.x - pointerPixels.x, projected.y - pointerPixels.y);
      if (screenDistance > bestDistance) {
        continue;
      }
      bestDistance = screenDistance;
      best = {
        targetId: candidate.targetId,
        vertexIndex,
        worldPoint: worldPoint.clone(),
      };
    }
  }
  return best;
}
