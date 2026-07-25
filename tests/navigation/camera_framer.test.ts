import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CameraFramer } from '../../src/navigation/camera_framer.js';
import { BoundingVolumeComputer } from '../../src/navigation/bounding_volume_computer.js';

describe('CameraFramer', () => {
  let framer: CameraFramer;
  let boundingVolumeComputer: BoundingVolumeComputer;
  let perspectiveCamera: THREE.PerspectiveCamera;
  let orthographicCamera: THREE.OrthographicCamera;

  beforeEach(() => {
    framer = new CameraFramer();
    boundingVolumeComputer = new BoundingVolumeComputer();
    perspectiveCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    perspectiveCamera.position.set(5, 5, 5);
    perspectiveCamera.lookAt(0, 0, 0);
    orthographicCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
    orthographicCamera.position.set(0, 0, 50);
    orthographicCamera.lookAt(0, 0, 0);
  });

  describe('computePerspectiveTarget', () => {
    it('should return a target look-at at the box center', () => {
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computePerspectiveTarget(box, perspectiveCamera, 1.12);
      expect(target.targetLookAt.x).toBeCloseTo(0, 3);
      expect(target.targetLookAt.y).toBeCloseTo(0, 3);
      expect(target.targetLookAt.z).toBeCloseTo(0, 3);
    });

    it('should position camera along view direction', () => {
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computePerspectiveTarget(box, perspectiveCamera, 1.12);
      const distance = target.targetPosition.distanceTo(target.targetLookAt);
      expect(distance).toBeGreaterThan(0);
    });

    it('should increase distance with larger padding factor', () => {
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const targetSmall = framer.computePerspectiveTarget(box, perspectiveCamera, 1.0);
      const targetLarge = framer.computePerspectiveTarget(box, perspectiveCamera, 3.0);
      const distSmall = targetSmall.targetPosition.distanceTo(targetSmall.targetLookAt);
      const distLarge = targetLarge.targetPosition.distanceTo(targetLarge.targetLookAt);
      expect(distLarge).toBeGreaterThan(distSmall);
    });

    it('should increase distance with larger bounding box', () => {
      const mesh = createBoxMesh(4, 4, 4, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computePerspectiveTarget(box, perspectiveCamera, 1.12);
      const distance = target.targetPosition.distanceTo(target.targetLookAt);
      expect(distance).toBeGreaterThan(1);
    });

    it('should handle offset box centers', () => {
      const mesh = createBoxMesh(1, 1, 1, 10, 10, 10);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computePerspectiveTarget(box, perspectiveCamera, 1.12);
      expect(target.targetLookAt.x).toBeCloseTo(10, 3);
      expect(target.targetLookAt.y).toBeCloseTo(10, 3);
      expect(target.targetLookAt.z).toBeCloseTo(10, 3);
    });

    it('should account for FOV in distance calculation', () => {
      const narrowCamera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
      narrowCamera.position.set(5, 5, 5);
      narrowCamera.lookAt(0, 0, 0);
      const wideCamera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
      wideCamera.position.set(5, 5, 5);
      wideCamera.lookAt(0, 0, 0);
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const narrowTarget = framer.computePerspectiveTarget(box, narrowCamera, 1.12);
      const wideTarget = framer.computePerspectiveTarget(box, wideCamera, 1.12);
      const narrowDist = narrowTarget.targetPosition.distanceTo(narrowTarget.targetLookAt);
      const wideDist = wideTarget.targetPosition.distanceTo(wideTarget.targetLookAt);
      expect(narrowDist).toBeGreaterThan(wideDist);
    });

    it('should frame elongated content much tighter than a bounding-sphere fit', () => {
      const meshA = createBoxMesh(1, 1, 1, -40, 0, 0);
      const meshB = createBoxMesh(1, 1, 1, 40, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([meshA, meshB]);
      const sphere = boundingVolumeComputer.computeBoundingSphere(box);
      perspectiveCamera.aspect = 16 / 9;
      perspectiveCamera.updateProjectionMatrix();
      perspectiveCamera.position.set(0, 20, 60);
      perspectiveCamera.lookAt(0, 0, 0);
      perspectiveCamera.updateMatrixWorld(true);
      const target = framer.computePerspectiveTarget(box, perspectiveCamera, 1.12);
      const aabbDistance = target.targetPosition.distanceTo(target.targetLookAt);
      const halfFov = (perspectiveCamera.fov * 0.5 * Math.PI) / 180;
      const sphereDistance = (sphere.radius * 1.5) / Math.sin(halfFov);
      expect(aabbDistance).toBeLessThan(sphereDistance * 0.55);
      expect(aabbDistance).toBeGreaterThan(1);
    });

    it('should keep all box corners inside the frustum after fit', () => {
      const mesh = createBoxMesh(4, 2, 6, 5, 1, -3);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      perspectiveCamera.aspect = 1.5;
      perspectiveCamera.updateProjectionMatrix();
      const target = framer.computePerspectiveTarget(box, perspectiveCamera, 1.12);
      perspectiveCamera.position.copy(target.targetPosition);
      perspectiveCamera.lookAt(target.targetLookAt);
      perspectiveCamera.updateMatrixWorld(true);
      perspectiveCamera.updateProjectionMatrix();
      const corners = getBoxCorners(box);
      corners.forEach((corner) => {
        const ndc = corner.project(perspectiveCamera);
        expect(ndc.x).toBeGreaterThanOrEqual(-1.001);
        expect(ndc.x).toBeLessThanOrEqual(1.001);
        expect(ndc.y).toBeGreaterThanOrEqual(-1.001);
        expect(ndc.y).toBeLessThanOrEqual(1.001);
        expect(ndc.z).toBeGreaterThanOrEqual(-1.001);
        expect(ndc.z).toBeLessThanOrEqual(1.001);
      });
    });

    it('should not modify the camera near or far clip planes', () => {
      const mesh = createBoxMesh(2, 2, 2, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const nearBefore = perspectiveCamera.near;
      const farBefore = perspectiveCamera.far;
      framer.computePerspectiveTarget(box, perspectiveCamera, 1.12);
      expect(perspectiveCamera.near).toBe(nearBefore);
      expect(perspectiveCamera.far).toBe(farBefore);
    });
  });

  describe('computeOrthographicTarget', () => {
    it('should return frustum planes enclosing the bounding box', () => {
      const mesh = createBoxMesh(2, 2, 2, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.0);
      expect(target.left).toBeCloseTo(-1);
      expect(target.right).toBeCloseTo(1);
      expect(target.top).toBeCloseTo(1);
      expect(target.bottom).toBeCloseTo(-1);
    });

    it('should expand frustum with padding factor', () => {
      const mesh = createBoxMesh(2, 2, 2, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.5);
      expect(target.left).toBeCloseTo(-1.5);
      expect(target.right).toBeCloseTo(1.5);
    });

    it('should handle offset bounding boxes in view space', () => {
      const mesh = createBoxMesh(2, 2, 2, 5, 5, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.0);
      expect(target.left).toBeCloseTo(4);
      expect(target.right).toBeCloseTo(6);
      expect(target.top).toBeCloseTo(6);
      expect(target.bottom).toBeCloseTo(4);
    });

    it('should expand asymmetric content to preserve frustum aspect', () => {
      const mesh = createBoxMesh(4, 2, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.0);
      const width = target.right - target.left;
      const height = target.top - target.bottom;
      const aspect =
        (orthographicCamera.right - orthographicCamera.left) / (orthographicCamera.top - orthographicCamera.bottom);
      expect(width / height).toBeCloseTo(aspect);
      expect(width).toBeGreaterThanOrEqual(4 - 1e-6);
      expect(height).toBeGreaterThanOrEqual(2 - 1e-6);
    });

    it('should handle single mesh', () => {
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.12);
      expect(target.right - target.left).toBeGreaterThan(0);
      expect(target.top - target.bottom).toBeGreaterThan(0);
    });

    it('should center frustum on bounding box center', () => {
      const meshA = createBoxMesh(1, 1, 1, -3, 0, 0);
      const meshB = createBoxMesh(1, 1, 1, 3, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([meshA, meshB]);
      const target = framer.computeOrthographicTarget(box, orthographicCamera, 1.0);
      const centerX = (target.left + target.right) / 2;
      expect(centerX).toBeCloseTo(0);
    });

    it('should frame correctly for a top-down orthographic camera', () => {
      const topCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
      topCamera.position.set(0, 50, 0);
      topCamera.up.set(0, 0, -1);
      topCamera.lookAt(0, 0, 0);
      topCamera.updateMatrixWorld(true);
      const mesh = createBoxMesh(2, 2, 4, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computeOrthographicTarget(box, topCamera, 1.0);
      expect(target.right - target.left).toBeGreaterThan(0);
      expect(target.top - target.bottom).toBeGreaterThan(0);
      const centerX = (target.left + target.right) / 2;
      const centerY = (target.top + target.bottom) / 2;
      expect(Math.abs(centerX)).toBeLessThan(0.01);
      expect(Math.abs(centerY)).toBeLessThan(0.01);
    });
  });

  describe('computePerspectiveTarget direction', () => {
    it('should keep the camera on the same side of the look-at target', () => {
      perspectiveCamera.position.set(5, 5, 5);
      perspectiveCamera.lookAt(0, 0, 0);
      const mesh = createBoxMesh(1, 1, 1, 0, 0, 0);
      const box = boundingVolumeComputer.computeWorldBoundingBox([mesh]);
      const target = framer.computePerspectiveTarget(box, perspectiveCamera, 1.12);
      const startDir = perspectiveCamera.position
        .clone()
        .sub(new THREE.Vector3(0, 0, 0))
        .normalize();
      const endDir = target.targetPosition.clone().sub(target.targetLookAt).normalize();
      expect(endDir.dot(startDir)).toBeGreaterThan(0.99);
    });
  });
});

/**
 * Creates a box mesh at a world position for framing tests.
 *
 * @param width Box width.
 * @param height Box height.
 * @param depth Box depth.
 * @param px World X.
 * @param py World Y.
 * @param pz World Z.
 * @returns Configured mesh.
 */
function createBoxMesh(width: number, height: number, depth: number, px: number, py: number, pz: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(px, py, pz);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Returns the eight corners of a world-space box.
 *
 * @param box Bounds to sample.
 * @returns Corner positions.
 */
function getBoxCorners(box: THREE.Box3): THREE.Vector3[] {
  const min = box.min;
  const max = box.max;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}
