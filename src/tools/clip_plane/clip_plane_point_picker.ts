import * as THREE from 'three';
import { RaycasterFaceSelection } from '@/selection/face/raycaster_face_selection.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { pointerEventToNdc } from '@/utils/pointer_ndc.js';

/** World pick result for clip plane placement, including optional surface data. */
export interface ClipPlanePickResult {
  /** Snapped world-space placement point. */
  point: THREE.Vector3;
  /** Outward face normal when the hit was on a mesh surface. */
  surfaceNormal: THREE.Vector3 | null;
}

/** Picks world points for clip plane placement from mesh hits or a ground plane. */
export class ClipPlanePointPicker {
  private faceRaycaster: RaycasterFaceSelection;
  private raycaster: THREE.Raycaster;
  private ndc: THREE.Vector2;
  private gridSnap: GridSnap;

  /**
   * Creates a point picker bound to a snap configuration.
   *
   * @param gridSnap Shared grid snap settings.
   */
  constructor(gridSnap: GridSnap) {
    this.faceRaycaster = new RaycasterFaceSelection();
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.gridSnap = gridSnap;
  }

  /**
   * Picks a world point from a pointer event. Prefers mesh surface hits, then
   * falls back to the XZ ground plane. Hold Shift to skip grid snap (precision
   * placement, same convention as bounds/transform tools).
   *
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param pickElement Viewport pickElement.
   * @param meshes Candidate meshes for surface hits.
   * @returns Pick result, or null when nothing was hit.
   */
  pickPoint(
    event: MouseEvent,
    camera: THREE.Camera,
    pickElement: HTMLElement,
    meshes: THREE.Mesh[],
  ): ClipPlanePickResult | null {
    const applySnap = !event.shiftKey;
    const surfaceHit = this.faceRaycaster.pickFace(event, camera, pickElement, meshes);
    if (surfaceHit) {
      return {
        point: this.resolvePoint(surfaceHit.hitPoint, applySnap),
        surfaceNormal: surfaceHit.faceNormal.clone().normalize(),
      };
    }
    const groundHit = this.pickGroundPlane(event, camera, pickElement);
    if (!groundHit) return null;
    return {
      point: this.resolvePoint(groundHit, applySnap),
      surfaceNormal: null,
    };
  }

  /**
   * Intersects the pointer ray with the world XZ plane (y = 0).
   *
   * @param event Pointer event.
   * @param camera Viewport camera.
   * @param pickElement Viewport pickElement.
   * @returns Hit point or null.
   */
  private pickGroundPlane(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): THREE.Vector3 | null {
    camera.updateMatrixWorld(true);
    pointerEventToNdc(event, pickElement, this.ndc);
    this.raycaster.setFromCamera(this.ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(plane, hit);
    return intersected ? hit : null;
  }

  /**
   * Clones a hit point and optionally applies grid snap.
   *
   * @param point World point.
   * @param applySnap Whether snapping is allowed for this pick.
   * @returns Resolved placement point.
   */
  private resolvePoint(point: THREE.Vector3, applySnap: boolean): THREE.Vector3 {
    const result = point.clone();
    if (applySnap) {
      this.gridSnap.snapWorldPosition(result);
    }
    return result;
  }
}
