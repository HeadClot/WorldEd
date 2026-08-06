import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SceneRaycaster } from '@/selection/object/scene_raycaster.js';
import { getOrBuildFacePickBvh } from '@/selection/pick/mesh_pick_acceleration.js';

/**
 * Builds a dense terrain-like plane for BVH pick correctness.
 *
 * @param segments Subdivision count per axis.
 * @returns Mesh with world matrix updated.
 */
function createDenseTerrainMesh(segments: number): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(20, 20, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, Math.sin(x * 0.4) * Math.cos(z * 0.4) * 0.5);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Builds a pick element mock for centered canvas.
 *
 * @returns HTML element mock.
 */
function createPickElement(): HTMLElement {
  return {
    clientWidth: 800,
    clientHeight: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
  } as HTMLElement;
}

describe('SceneRaycaster BVH object pick', () => {
  it('picks dense terrain and builds face-pick BVH acceleration', () => {
    const raycaster = new SceneRaycaster();
    const mesh = createDenseTerrainMesh(128);
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
    camera.position.set(0, 25, 30);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const event = { clientX: 400, clientY: 300 } as MouseEvent;
    const hit = raycaster.cast(camera, pickElement, event, [mesh]);
    expect(hit).toBe(mesh);
    expect(getOrBuildFacePickBvh(mesh)).not.toBeNull();
    mesh.geometry.dispose();
  });

  it('picks a dense sphere after BVH warm-up', () => {
    const raycaster = new SceneRaycaster();
    const geometry = new THREE.SphereGeometry(1, 170, 170);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const event = { clientX: 400, clientY: 300 } as MouseEvent;
    getOrBuildFacePickBvh(mesh);
    const hit = raycaster.cast(camera, pickElement, event, [mesh]);
    expect(hit).toBe(mesh);
    geometry.dispose();
  });

  it('still picks back-facing planes for object select', () => {
    const raycaster = new SceneRaycaster();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
    plane.position.set(0, 0, 0);
    plane.rotation.y = Math.PI;
    plane.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const pickElement = createPickElement();
    const event = { clientX: 400, clientY: 300 } as MouseEvent;
    expect(raycaster.cast(camera, pickElement, event, [plane])).toBe(plane);
    plane.geometry.dispose();
  });
});
