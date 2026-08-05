import * as THREE from 'three';
import {
  meshTopologyFaceHalfEdgeIndices,
  meshTopologyHalfEdgeCornerVertex,
  meshTopologyHalfEdgeDestinationVertex,
} from '@/mesh/topology/mesh_topology_query.js';
import { meshVertexPositionRead } from '@/mesh/topology/mesh_vertex_position.js';
import { buildComponentEdgeKey } from '@/edit/component/component_selection_entry.js';
import type { ComponentVertexPickCandidate } from './raycaster_component_vertex.js';
import {
  distancePointToSegment2d,
  pointerEventToPickPixels,
  projectWorldPointToPickPixels,
  resolveEditComponentPickElementMetrics,
  type EditComponentPickElementMetrics,
} from './edit_component_screen_metrics.js';

/** Result of an edge pick in Edit Mode. */
export interface ComponentEdgePickResult {
  targetId: string;
  edgeKey: string;
  worldPoint: THREE.Vector3;
}

/**
 * Picks the nearest undirected edge projected near the pointer.
 *
 * @param event Pointer or mouse event.
 * @param camera Active camera.
 * @param pickElement Element providing size for NDC.
 * @param candidates Domain content meshes with documents.
 * @param pixelRadius Max screen distance in CSS pixels.
 * @returns Closest edge pick, or null.
 */
export function pickComponentEdge(
  event: MouseEvent,
  camera: THREE.Camera,
  pickElement: HTMLElement,
  candidates: readonly ComponentVertexPickCandidate[],
  pixelRadius: number = 56,
): ComponentEdgePickResult | null {
  camera.updateMatrixWorld(true);
  const metrics = resolveEditComponentPickElementMetrics(pickElement);
  const pointerPixels = pointerEventToPickPixels(event, pickElement, metrics);
  let best: ComponentEdgePickResult | null = null;
  let bestDistance = pixelRadius;
  for (const candidate of candidates) {
    const hit = pickEdgesOnCandidate(candidate, camera, metrics, pointerPixels, bestDistance);
    if (!hit) {
      continue;
    }
    bestDistance = hit.screenDistance;
    best = hit.result;
  }
  return best;
}

/**
 * Picks the closest edge on one candidate mesh.
 *
 * @param candidate Mesh document candidate.
 * @param camera Camera.
 * @param metrics Pick element metrics.
 * @param pointerPixels Pointer in CSS pixels.
 * @param bestDistance Current best screen distance.
 * @returns Hit with distance, or null.
 */
function pickEdgesOnCandidate(
  candidate: ComponentVertexPickCandidate,
  camera: THREE.Camera,
  metrics: EditComponentPickElementMetrics,
  pointerPixels: THREE.Vector2,
  bestDistance: number,
): { result: ComponentEdgePickResult; screenDistance: number } | null {
  const topology = candidate.document.getTopology();
  const positions = topology.getPositions();
  candidate.mesh.updateMatrixWorld(true);
  const seenEdges = new Set<string>();
  let best: { result: ComponentEdgePickResult; screenDistance: number } | null = null;
  let limit = bestDistance;
  const faceCount = topology.getFaceCount();
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    for (const halfEdgeIndex of meshTopologyFaceHalfEdgeIndices(topology, faceIndex)) {
      const a = meshTopologyHalfEdgeCornerVertex(topology, halfEdgeIndex);
      const b = meshTopologyHalfEdgeDestinationVertex(topology, halfEdgeIndex);
      const edgeKey = buildComponentEdgeKey(a, b);
      if (seenEdges.has(edgeKey)) {
        continue;
      }
      seenEdges.add(edgeKey);
      const screenDistance = measureEdgeScreenDistance(
        positions,
        a,
        b,
        candidate.mesh.matrixWorld,
        camera,
        metrics,
        pointerPixels,
      );
      if (screenDistance === null || screenDistance > limit) {
        continue;
      }
      limit = screenDistance;
      best = {
        screenDistance,
        result: {
          targetId: candidate.targetId,
          edgeKey,
          worldPoint: new THREE.Vector3(),
        },
      };
    }
  }
  return best;
}

/**
 * Measures screen-space distance from the pointer to a world edge segment.
 *
 * @param positions Packed vertex positions.
 * @param vertexA Edge start index.
 * @param vertexB Edge end index.
 * @param matrixWorld Mesh world matrix.
 * @param camera Camera.
 * @param metrics Pick element metrics.
 * @param pointerPixels Pointer in CSS pixels.
 * @returns Distance in CSS pixels, or null when behind the camera.
 */
function measureEdgeScreenDistance(
  positions: Float32Array,
  vertexA: number,
  vertexB: number,
  matrixWorld: THREE.Matrix4,
  camera: THREE.Camera,
  metrics: EditComponentPickElementMetrics,
  pointerPixels: THREE.Vector2,
): number | null {
  const scratch = { 0: 0, 1: 0, 2: 0, length: 3 } as { 0: number; 1: number; 2: number; length: number };
  const worldA = new THREE.Vector3();
  const worldB = new THREE.Vector3();
  meshVertexPositionRead(positions, vertexA, scratch);
  worldA.set(scratch[0], scratch[1], scratch[2]).applyMatrix4(matrixWorld);
  meshVertexPositionRead(positions, vertexB, scratch);
  worldB.set(scratch[0], scratch[1], scratch[2]).applyMatrix4(matrixWorld);
  const projectedA = projectWorldPointToPickPixels(worldA, camera, metrics);
  const projectedB = projectWorldPointToPickPixels(worldB, camera, metrics);
  if (!projectedA && !projectedB) {
    return null;
  }
  const ax = projectedA?.x ?? projectedB!.x;
  const ay = projectedA?.y ?? projectedB!.y;
  const bx = projectedB?.x ?? projectedA!.x;
  const by = projectedB?.y ?? projectedA!.y;
  return distancePointToSegment2d(pointerPixels.x, pointerPixels.y, ax, ay, bx, by);
}
