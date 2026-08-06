import * as THREE from 'three';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import {
  pointerEventToPickPixels,
  projectWorldPointToPickPixels,
  resolveEditComponentPickElementMetrics,
} from '@/edit/pick/edit_component_screen_metrics.js';

/** Result of a mesh vertex pick for grid lattice origin. */
export interface GridVertexPickResult {
  worldPoint: THREE.Vector3;
}

/** Default max screen distance in CSS pixels for vertex hover/pick. */
const DEFAULT_VERTEX_PIXEL_RADIUS = 16;

/**
 * Picks the nearest mesh vertex under the pointer for grid origin zeroing. Uses
 * the same mesh eligibility as face and edge align.
 */
export class PickerGridVertexOrigin {
  /**
   * Picks the closest projected vertex under the pointer.
   *
   * @param event Pointer or mouse event.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   * @param worldObject World hierarchy root.
   * @param pixelRadius Max screen distance in CSS pixels.
   * @returns Vertex pick result, or null when nothing was near enough.
   */
  pickVertex(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    worldObject: THREE.Object3D,
    pixelRadius: number = DEFAULT_VERTEX_PIXEL_RADIUS,
  ): GridVertexPickResult | null {
    camera.updateMatrixWorld(true);
    const metrics = resolveEditComponentPickElementMetrics(pickElement);
    const pointerPixels = pointerEventToPickPixels(event, pickElement, metrics);
    let best: GridVertexPickResult | null = null;
    let bestDistance = pixelRadius;
    const meshes = this.collectPickableMeshes(worldObject);
    for (const mesh of meshes) {
      const hit = this.pickClosestVertexOnMesh(mesh, camera, metrics, pointerPixels, bestDistance);
      if (!hit) {
        continue;
      }
      bestDistance = hit.screenDistance;
      best = hit.result;
    }
    return best;
  }

  /**
   * Collects meshes eligible for vertex origin picks.
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
      if (SolidBrushVisual.shouldSkipFacePick(child)) {
        return;
      }
      meshes.push(child);
    });
    return meshes;
  }

  /**
   * Finds the closest vertex on one mesh.
   *
   * @param mesh Mesh to search.
   * @param camera Camera.
   * @param metrics Pick element metrics.
   * @param pointerPixels Pointer in CSS pixels.
   * @param bestDistance Current best screen distance.
   * @returns Hit with distance, or null.
   */
  private pickClosestVertexOnMesh(
    mesh: THREE.Mesh,
    camera: THREE.Camera,
    metrics: { width: number; height: number },
    pointerPixels: THREE.Vector2,
    bestDistance: number,
  ): { result: GridVertexPickResult; screenDistance: number } | null {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (!(position instanceof THREE.BufferAttribute) && !(position instanceof THREE.InterleavedBufferAttribute)) {
      return null;
    }
    mesh.updateMatrixWorld(true);
    let best: { result: GridVertexPickResult; screenDistance: number } | null = null;
    let limit = bestDistance;
    const worldPoint = new THREE.Vector3();
    const projected = new THREE.Vector2();
    for (let index = 0; index < position.count; index++) {
      worldPoint.set(position.getX(index), position.getY(index), position.getZ(index));
      worldPoint.applyMatrix4(mesh.matrixWorld);
      const screen = projectWorldPointToPickPixels(worldPoint, camera, metrics, projected);
      if (!screen) {
        continue;
      }
      const screenDistance = Math.hypot(screen.x - pointerPixels.x, screen.y - pointerPixels.y);
      if (screenDistance > limit) {
        continue;
      }
      limit = screenDistance;
      best = {
        screenDistance,
        result: { worldPoint: worldPoint.clone() },
      };
    }
    return best;
  }
}
