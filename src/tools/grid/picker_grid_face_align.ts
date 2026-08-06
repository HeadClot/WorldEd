import * as THREE from 'three';
import { RaycasterFaceSelection, type FacePickResult } from '@/selection/face/raycaster_face_selection.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

/**
 * Picks a content or solid-result face for grid orientation align without
 * entering face selection mode. Matches face-mode mesh eligibility: ordinary
 * meshes and solid CSG result surfaces are pickable; solid brush hull helpers
 * are skipped so invisible subtractive hulls never block picks.
 */
export class PickerGridFaceAlign {
  private readonly faceRaycaster: RaycasterFaceSelection;

  /** Creates a face align picker. */
  constructor() {
    this.faceRaycaster = new RaycasterFaceSelection();
  }

  /**
   * Picks the closest front-facing content or solid-result face under the
   * pointer.
   *
   * @param event Pointer or mouse event.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   * @param worldObject World hierarchy root.
   * @returns Face pick result, or null when nothing was hit.
   */
  pickFace(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    worldObject: THREE.Object3D,
  ): FacePickResult | null {
    const meshes = this.collectPickableMeshes(worldObject);
    return this.faceRaycaster.pickFace(event, camera, pickElement, meshes);
  }

  /**
   * Collects meshes eligible for face align picks. Same filter as face
   * selection mode: skip solid brush volume helpers only.
   *
   * @param worldObject World hierarchy root.
   * @returns Pickable meshes (content + solid CSG results).
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
}
