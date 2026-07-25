import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { InfiniteGrid2D } from '../../../src/viewports/grid/infinite_grid_2d.js';
import { OrthoDepthRanger } from '../../../src/viewports/ortho_depth_ranger.js';

/**
 * Reads the depth-axis component from a grid line buffer for assertions.
 *
 * @param grid Grid under test.
 * @param plane Grid plane determining which component is depth.
 * @returns First vertex depth component, or null when empty.
 */
function readFirstVertexDepth(grid: InfiniteGrid2D, plane: 'xy' | 'xz' | 'yz'): number | null {
  const lines = grid.getObject().children[0] as THREE.LineSegments;
  const positions = lines.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!positions || positions.count < 1) return null;
  if (plane === 'xz') return positions.getY(0);
  if (plane === 'xy') return positions.getZ(0);
  return positions.getX(0);
}

/**
 * Returns true when every grid vertex lies inside the camera near/far volume.
 *
 * @param grid Grid under test.
 * @param camera Orthographic camera after depth ranging.
 * @returns True when all vertices project within near..far.
 */
function everyVertexInsideNearFar(grid: InfiniteGrid2D, camera: THREE.OrthographicCamera): boolean {
  const lines = grid.getObject().children[0] as THREE.LineSegments;
  const positions = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const viewDir = new THREE.Vector3();
  camera.getWorldDirection(viewDir);
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.set(positions.getX(i), positions.getY(i), positions.getZ(i));
    const depth = point.sub(camera.position).dot(viewDir);
    if (depth < camera.near - 1e-4 || depth > camera.far + 1e-4) return false;
  }
  return true;
}

describe('InfiniteGrid2D', () => {
  let camera: THREE.OrthographicCamera;

  beforeEach(() => {
    camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    camera.position.set(0, 0, 50);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
  });

  it('should generate lines for the xy plane', () => {
    const grid = new InfiniteGrid2D('xy', 0.25);
    grid.update(camera);
    expect(grid.getSegmentCount()).toBeGreaterThan(0);
  });

  it('should generate lines for xz and yz planes', () => {
    const top = new InfiniteGrid2D('xz', 0.25);
    const side = new InfiniteGrid2D('yz', 0.25);
    camera.position.set(0, 50, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    top.update(camera);
    camera.position.set(50, 0, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    side.update(camera);
    expect(top.getSegmentCount()).toBeGreaterThan(0);
    expect(side.getSegmentCount()).toBeGreaterThan(0);
  });

  it('should keep side-view grid inside near/far when content is offset on +X', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    camera.position.set(50, 0.5, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0.5, 0);
    camera.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    const brush = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    brush.position.set(8, 0.5, 0);
    brush.updateMatrixWorld(true);
    scene.add(brush);
    OrthoDepthRanger.update(camera, scene);
    const grid = new InfiniteGrid2D('yz', 0.25);
    grid.update(camera);
    expect(grid.getSegmentCount()).toBeGreaterThan(0);
    expect(everyVertexInsideNearFar(grid, camera)).toBe(true);
    const depth = readFirstVertexDepth(grid, 'yz');
    expect(depth).not.toBeNull();
    expect(Math.abs(depth!)).toBeGreaterThan(1);
  });

  it('should keep side-view grid inside near/far when content is offset on -X', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    camera.position.set(50, 0.5, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0.5, 0);
    camera.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    const brush = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    brush.position.set(-4, 0.5, 0);
    brush.updateMatrixWorld(true);
    scene.add(brush);
    OrthoDepthRanger.update(camera, scene);
    const grid = new InfiniteGrid2D('yz', 0.25);
    grid.update(camera);
    expect(grid.getSegmentCount()).toBeGreaterThan(0);
    expect(everyVertexInsideNearFar(grid, camera)).toBe(true);
  });

  it('should keep top and front grids inside near/far after depth ranging', () => {
    const topCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    topCamera.position.set(0, 50, 0);
    topCamera.up.set(0, 0, -1);
    topCamera.lookAt(0, 0, 0);
    topCamera.updateMatrixWorld(true);
    const frontCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    frontCamera.position.set(0, 0.5, 50);
    frontCamera.up.set(0, 1, 0);
    frontCamera.lookAt(0, 0.5, 0);
    frontCamera.updateMatrixWorld(true);
    const scene = new THREE.Scene();
    const brush = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    brush.position.set(0, 8, 8);
    brush.updateMatrixWorld(true);
    scene.add(brush);
    OrthoDepthRanger.update(topCamera, scene);
    OrthoDepthRanger.update(frontCamera, scene);
    const top = new InfiniteGrid2D('xz', 0.25);
    const front = new InfiniteGrid2D('xy', 0.25);
    top.update(topCamera);
    front.update(frontCamera);
    expect(top.getSegmentCount()).toBeGreaterThan(0);
    expect(front.getSegmentCount()).toBeGreaterThan(0);
    expect(everyVertexInsideNearFar(top, topCamera)).toBe(true);
    expect(everyVertexInsideNearFar(front, frontCamera)).toBe(true);
  });

  it('should disable depth testing so content cannot hide the reference grid', () => {
    const grid = new InfiniteGrid2D('xy', 0.25);
    const lines = grid.getObject().children[0] as THREE.LineSegments;
    const material = lines.material as THREE.LineBasicMaterial;
    expect(material.depthTest).toBe(false);
  });

  it('should coarsen cells when zoomed far out without exploding line count', () => {
    const grid = new InfiniteGrid2D('xy', 0.125);
    camera.left = -200;
    camera.right = 200;
    camera.top = 200;
    camera.bottom = -200;
    camera.updateProjectionMatrix();
    grid.update(camera);
    expect(grid.getSegmentCount()).toBeGreaterThan(0);
    expect(grid.getSegmentCount()).toBeLessThan(20000);
  });

  it('should keep drawing lines when zooming out across LOD boundaries', () => {
    const grid = new InfiniteGrid2D('xy', 0.25);
    const counts: number[] = [];
    for (const size of [8, 16, 32, 64, 128]) {
      camera.left = -size;
      camera.right = size;
      camera.top = size;
      camera.bottom = -size;
      camera.updateProjectionMatrix();
      grid.update(camera);
      counts.push(grid.getSegmentCount());
    }
    counts.forEach((count) => expect(count).toBeGreaterThan(0));
    expect(Math.min(...counts)).toBeGreaterThan(0);
  });

  it('should use brighter colors for section and major lines than minor lines', () => {
    const grid = new InfiniteGrid2D('xy', 1);
    camera.left = -20;
    camera.right = 20;
    camera.top = 20;
    camera.bottom = -20;
    camera.updateProjectionMatrix();
    grid.update(camera);
    const colors = (grid.getObject().children[0] as THREE.LineSegments).geometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute;
    let minLuma = Infinity;
    let maxLuma = -Infinity;
    for (let i = 0; i < colors.count; i++) {
      const luma = colors.getX(i) + colors.getY(i) + colors.getZ(i);
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
    }
    expect(maxLuma).toBeGreaterThan(minLuma + 0.05);
  });

  it('should accept snap interval updates', () => {
    const grid = new InfiniteGrid2D('xy', 0.25);
    grid.setSnapInterval(1);
    grid.update(camera);
    expect(grid.getSegmentCount()).toBeGreaterThan(0);
  });

  it('should dispose without throwing', () => {
    const grid = new InfiniteGrid2D('xy', 0.25);
    grid.update(camera);
    expect(() => grid.dispose()).not.toThrow();
  });
});
