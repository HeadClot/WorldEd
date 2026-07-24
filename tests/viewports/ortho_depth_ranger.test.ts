import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { OrthoDepthRanger } from '../../src/viewports/ortho_depth_ranger.js';

/**
 * Ortho depth ranging must put far ±X content in front of the side camera
 * without changing lateral frustum zoom.
 */
describe('OrthoDepthRanger', () => {
  it('slides the side camera past far +X content and keeps it in near/far', () => {
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 1000);
    camera.position.set(50, 0.5, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0.5, 0);
    camera.updateMatrixWorld(true);
    const leftBefore = camera.left;
    const rightBefore = camera.right;
    const scene = new THREE.Scene();
    const farMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 12), new THREE.MeshBasicMaterial());
    farMesh.position.set(8000, 4, 120);
    farMesh.updateMatrixWorld(true);
    scene.add(farMesh);
    OrthoDepthRanger.update(camera, scene);
    expect(camera.left).toBe(leftBefore);
    expect(camera.right).toBe(rightBefore);
    expect(camera.position.x).toBeGreaterThan(farMesh.position.x);
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    const depth = farMesh.position.clone().sub(camera.position).dot(viewDir);
    expect(depth).toBeGreaterThan(camera.near);
    expect(depth).toBeLessThan(camera.far);
  });

  it('covers both negative and positive X content from the side view', () => {
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 1000);
    camera.position.set(50, 0.5, 0);
    camera.lookAt(0, 0.5, 0);
    camera.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    const negative = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial());
    negative.position.set(-300, 2, 0);
    const positive = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial());
    positive.position.set(4000, 2, 0);
    scene.add(negative);
    scene.add(positive);
    negative.updateMatrixWorld(true);
    positive.updateMatrixWorld(true);
    OrthoDepthRanger.update(camera, scene);
    const viewDir = new THREE.Vector3();
    camera.getWorldDirection(viewDir);
    for (const mesh of [negative, positive]) {
      const depth = mesh.position.clone().sub(camera.position).dot(viewDir);
      expect(depth).toBeGreaterThan(camera.near);
      expect(depth).toBeLessThan(camera.far);
    }
  });
});
