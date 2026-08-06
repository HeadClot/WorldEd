import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PickerGridFaceAlign } from '@/tools/grid/picker_grid_face_align.js';
import { SOLID_MODEL_RESULT_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';

/**
 * Builds a center-screen pick fixture over a world mesh.
 *
 * @param world World hierarchy root containing pickable meshes.
 * @returns Pick arguments for the align picker.
 */
function createCenterScreenPick(world: THREE.Object3D): {
  event: MouseEvent;
  camera: THREE.PerspectiveCamera;
  pickElement: HTMLElement;
  world: THREE.Object3D;
} {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 6);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const pickElement = document.createElement('div');
  pickElement.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return {
    event: { clientX: 100, clientY: 100 } as MouseEvent,
    camera,
    pickElement,
    world,
  };
}

describe('PickerGridFaceAlign', () => {
  it('picks a unit box front face normal without entering face mode', () => {
    const world = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    world.add(mesh);
    const fixture = createCenterScreenPick(world);
    const pick = new PickerGridFaceAlign().pickFace(fixture.event, fixture.camera, fixture.pickElement, fixture.world);
    expect(pick).not.toBeNull();
    if (!pick) {
      return;
    }
    expect(pick.faceNormal.z).toBeGreaterThan(0.9);
  });

  it('picks solid CSG result meshes used for solid brush faces', () => {
    const world = new THREE.Group();
    const resultMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    resultMesh.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
    resultMesh.updateMatrixWorld(true);
    world.add(resultMesh);
    const fixture = createCenterScreenPick(world);
    const pick = new PickerGridFaceAlign().pickFace(fixture.event, fixture.camera, fixture.pickElement, fixture.world);
    expect(pick).not.toBeNull();
    if (!pick) {
      return;
    }
    expect(pick.mesh).toBe(resultMesh);
    expect(pick.faceNormal.z).toBeGreaterThan(0.9);
  });

  it('skips solid brush hull helpers so result faces remain pickable', () => {
    const world = new THREE.Group();
    const brushHull = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    SolidBrushVisual.stampBrushHelperMetadata(brushHull);
    brushHull.updateMatrixWorld(true);
    world.add(brushHull);
    const resultMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    resultMesh.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
    resultMesh.updateMatrixWorld(true);
    world.add(resultMesh);
    const fixture = createCenterScreenPick(world);
    const pick = new PickerGridFaceAlign().pickFace(fixture.event, fixture.camera, fixture.pickElement, fixture.world);
    expect(pick).not.toBeNull();
    if (!pick) {
      return;
    }
    expect(pick.mesh).toBe(resultMesh);
    expect(SolidBrushVisual.shouldSkipFacePick(pick.mesh)).toBe(false);
  });
});
