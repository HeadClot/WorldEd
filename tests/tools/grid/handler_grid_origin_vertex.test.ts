import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerGridOrientation } from '@/tools/grid/handler_grid_orientation.js';
import { CoordinatorEditorOrientation } from '@/navigation/orientation/coordinator_editor_orientation.js';

/**
 * Builds a pick element with a fixed 200×200 CSS rect.
 *
 * @returns HTML element mock.
 */
function createPickElement(): HTMLElement {
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
  return pickElement;
}

describe('HandlerGridOrientation origin vertex', () => {
  it('zeros the grid lattice origin to a picked vertex without rotating axes', () => {
    const world = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    mesh.position.set(3, 1, -2);
    mesh.updateMatrixWorld(true);
    world.add(mesh);
    const scene = new THREE.Scene();
    scene.add(world);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(3, 1, 6);
    camera.lookAt(3, 1, -2);
    camera.updateMatrixWorld(true);
    const status = vi.fn();
    const orientationCoordinator = new CoordinatorEditorOrientation({
      getViewports: () => [],
      showStatusMessage: status,
    });
    orientationCoordinator.alignGridAxisToEdge(
      'z',
      new THREE.Vector3(1, 0, 1).normalize(),
      new THREE.Vector3(9, 9, 9),
      new THREE.Vector3(1, 0, 1).normalize(),
    );
    const axesBefore = orientationCoordinator.getGridOrientation().getWorldBasis();
    const handler = new HandlerGridOrientation({
      worldObject: world,
      orientationCoordinator,
      getViewports: () => [],
      getPrimaryScene: () => scene,
      showStatusMessage: status,
    });
    handler.armOriginVertexPick();
    expect(handler.getPickMode()).toBe('grid_origin_vertex');
    const corner = new THREE.Vector3(1, 1, 1).applyMatrix4(mesh.matrixWorld);
    const projected = corner.clone().project(camera);
    const clientX = (projected.x + 1) * 0.5 * 200;
    const clientY = (1 - (projected.y + 1) * 0.5) * 200;
    const applied = handler.tryAlignPickAtPointer(clientX, clientY, camera, createPickElement());
    expect(applied).toBe(true);
    const origin = orientationCoordinator.getGridOrientation().getPlaneFrame().origin;
    expect(origin.distanceTo(corner)).toBeLessThan(0.05);
    const axesAfter = orientationCoordinator.getGridOrientation().getWorldBasis();
    expect(axesAfter.xAxis.distanceTo(axesBefore.xAxis)).toBeLessThan(1e-6);
    expect(axesAfter.yAxis.distanceTo(axesBefore.yAxis)).toBeLessThan(1e-6);
    expect(axesAfter.zAxis.distanceTo(axesBefore.zAxis)).toBeLessThan(1e-6);
    handler.dispose();
  });
});
