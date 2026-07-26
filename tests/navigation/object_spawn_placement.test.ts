import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeCameraForwardSpawnPosition,
  computeOcclusionAwareSpawnPosition,
  isSpawnRaycastMesh,
  snapPositionToGrid,
} from '../../src/navigation/object_spawn_placement.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../../src/selection/object/selection_highlight.js';
import { getDefaultPerspectiveCameraPosition } from '../../src/navigation/default_camera_placement.js';

/** Unit tests for camera-front and occlusion-aware object spawn placement. */
describe('object_spawn_placement', () => {
  it('places along the camera forward at the preferred distance', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(10, 4, 20);
    camera.lookAt(10, 4, 0);
    camera.updateMatrixWorld(true);
    const position = computeCameraForwardSpawnPosition(camera, 8);
    snapPositionToGrid(position, 1);
    expect(position.z).toBeLessThan(camera.position.z);
    expect(position.x).toBeCloseTo(10, 5);
  });

  it('snaps each axis to the grid interval', () => {
    const position = new THREE.Vector3(1.4, -2.6, 3.1);
    snapPositionToGrid(position, 1);
    expect(position.x).toBe(1);
    expect(position.y).toBe(-3);
    expect(position.z).toBe(3);
  });

  it('places outside a wall face using the surface normal', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const world = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2), new THREE.MeshBasicMaterial());
    wall.position.set(0, 0, 4);
    world.add(wall);
    world.updateMatrixWorld(true);

    const openSpace = computeCameraForwardSpawnPosition(camera, 8);
    expect(openSpace.z).toBeCloseTo(2, 5);

    const objectRadius = 0.5;
    const placed = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: 8,
      gridInterval: 0.25,
      raycastRoot: world,
      objectRadius,
    });
    const wallFrontZ = 4.1;
    expect(placed.z).toBeGreaterThanOrEqual(wallFrontZ + objectRadius - 1e-6);
    expect(placed.z).toBeLessThan(10);
    expect(placed.z).toBeGreaterThan(openSpace.z);
  });

  it('does not let grid snap push the spawn into the occluding surface', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const world = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2), new THREE.MeshBasicMaterial());
    wall.position.set(0, 0, 5);
    world.add(wall);
    world.updateMatrixWorld(true);

    const objectRadius = 0.5;
    const wallFrontZ = 5.1;
    const placed = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: 8,
      gridInterval: 0.25,
      raycastRoot: world,
      objectRadius,
    });

    expect(placed.z).toBeGreaterThanOrEqual(wallFrontZ + objectRadius - 1e-6);
  });

  it('sits flush against the startup unit brush without a large air gap', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.copy(getDefaultPerspectiveCameraPosition());
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const world = new THREE.Group();
    const existing = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    existing.position.set(0, 0, 0);
    world.add(existing);
    world.updateMatrixWorld(true);

    const objectRadius = 0.5;
    const placed = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: 8,
      gridInterval: 0.25,
      raycastRoot: world,
      objectRadius,
    });

    const existingBox = new THREE.Box3().setFromCenterAndSize(existing.position, new THREE.Vector3(1, 1, 1));
    const spawnedBox = new THREE.Box3().setFromCenterAndSize(placed, new THREE.Vector3(1, 1, 1));
    const interiorSpawned = spawnedBox.clone().expandByScalar(-1e-3);
    expect(existingBox.intersectsBox(interiorSpawned)).toBe(false);
    const centerDistance = placed.length();
    expect(centerDistance).toBeLessThanOrEqual(1.0 + 0.25 + 1e-6);
  });

  it('keeps preferred distance when the view ray is clear', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const world = new THREE.Group();
    const farBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    farBox.position.set(0, 0, -20);
    world.add(farBox);
    world.updateMatrixWorld(true);

    const placed = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: 8,
      gridInterval: 1,
      raycastRoot: world,
      objectRadius: 0.5,
    });
    expect(placed.z).toBeCloseTo(2, 5);
  });

  it('ignores selection highlights for occlusion tests', () => {
    const highlight = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    highlight.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    expect(isSpawnRaycastMesh(highlight)).toBe(false);
    const content = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    expect(isSpawnRaycastMesh(content)).toBe(true);
  });
});
