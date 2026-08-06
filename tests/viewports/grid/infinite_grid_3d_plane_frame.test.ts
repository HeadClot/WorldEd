import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { InfiniteGrid3D } from '@/viewports/grid/infinite_grid_3d.js';
import { buildPlaneFrameFromNormal } from '@/navigation/orientation/editor_orientation_basis.js';

describe('InfiniteGrid3D plane frame', () => {
  let grid: InfiniteGrid3D;
  let camera: THREE.PerspectiveCamera;

  beforeEach(() => {
    grid = new InfiniteGrid3D(1);
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 5, 0);
  });

  it('keeps default grid lines on the world XZ plane', () => {
    grid.update(camera);
    const positions = (grid.getObject().children[0] as THREE.LineSegments).geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    for (let i = 0; i < Math.min(positions.count, 40); i++) {
      expect(Math.abs(positions.getY(i))).toBeLessThan(1e-5);
    }
  });

  it('places grid lines on an aligned wall plane', () => {
    const frame = buildPlaneFrameFromNormal(new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0));
    grid.setPlaneFrame(frame);
    camera.position.set(5, 0, 0);
    grid.update(camera);
    const positions = (grid.getObject().children[0] as THREE.LineSegments).geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    const normal = frame.normal;
    const origin = frame.origin;
    for (let i = 0; i < Math.min(positions.count, 60); i++) {
      const point = new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i));
      const offset = point.clone().sub(origin);
      expect(Math.abs(offset.dot(normal))).toBeLessThan(1e-4);
    }
  });

  it('restores the default plane frame', () => {
    grid.setPlaneFrame(buildPlaneFrameFromNormal(new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 2, 3)));
    grid.resetPlaneFrame();
    const frame = grid.getPlaneFrame();
    expect(frame.origin.length()).toBe(0);
    expect(frame.normal.y).toBeCloseTo(1, 6);
  });
});
