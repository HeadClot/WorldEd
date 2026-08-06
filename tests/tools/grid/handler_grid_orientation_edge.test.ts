import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerGridOrientation } from '@/tools/grid/handler_grid_orientation.js';
import { CoordinatorEditorOrientation } from '@/navigation/orientation/coordinator_editor_orientation.js';

describe('HandlerGridOrientation edge and camera modes', () => {
  it('arms edge align and applies grid Z from a box edge without changing camera', () => {
    const world = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    world.add(mesh);
    const scene = new THREE.Scene();
    scene.add(world);
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
    const status = vi.fn();
    const orientationCoordinator = new CoordinatorEditorOrientation({
      getViewports: () => [],
      showStatusMessage: status,
    });
    const handler = new HandlerGridOrientation({
      worldObject: world,
      orientationCoordinator,
      getViewports: () => [],
      getPrimaryScene: () => scene,
      showStatusMessage: status,
    });
    handler.armEdgeAlignPick('z');
    expect(handler.isAlignPickArmed()).toBe(true);
    expect(handler.getPickMode()).toBe('grid_edge_z');
    // Click a true outline edge midpoint (not the face center, which only hits
    // triangulation diagonals on a triangulated box face).
    const edgeMid = new THREE.Vector3(0, 1, 1).project(camera);
    const clientX = (edgeMid.x + 1) * 0.5 * 200;
    const clientY = (1 - (edgeMid.y + 1) * 0.5) * 200;
    handler.updateHoverAtPointer(clientX, clientY, camera, pickElement);
    const applied = handler.tryAlignPickAtPointer(clientX, clientY, camera, pickElement);
    expect(applied).toBe(true);
    expect(handler.isAlignPickArmed()).toBe(false);
    expect(orientationCoordinator.getCameraOrientation().isDefault()).toBe(true);
    expect(orientationCoordinator.getGridOrientation().isDefault()).toBe(false);
    // Edge mid (0,1,1) is equidistant to (-1,1,1) and (1,1,1); origin snaps to a vertex.
    const origin = orientationCoordinator.getGridOrientation().getPlaneFrame().origin;
    const nearLeft = origin.distanceTo(new THREE.Vector3(-1, 1, 1));
    const nearRight = origin.distanceTo(new THREE.Vector3(1, 1, 1));
    expect(Math.min(nearLeft, nearRight)).toBeLessThan(1e-5);
    handler.dispose();
  });

  it('uses free edge-point origin without vertex snap when Shift is held', () => {
    const world = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    world.add(mesh);
    const scene = new THREE.Scene();
    scene.add(world);
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
    const status = vi.fn();
    const orientationCoordinator = new CoordinatorEditorOrientation({
      getViewports: () => [],
      showStatusMessage: status,
    });
    const handler = new HandlerGridOrientation({
      worldObject: world,
      orientationCoordinator,
      getViewports: () => [],
      getPrimaryScene: () => scene,
      showStatusMessage: status,
      isShiftPressed: () => true,
    });
    handler.armEdgeAlignPick('z');
    const edgeMid = new THREE.Vector3(0, 1, 1).project(camera);
    const clientX = (edgeMid.x + 1) * 0.5 * 200;
    const clientY = (1 - (edgeMid.y + 1) * 0.5) * 200;
    const applied = handler.tryAlignPickAtPointer(clientX, clientY, camera, pickElement);
    expect(applied).toBe(true);
    const origin = orientationCoordinator.getGridOrientation().getPlaneFrame().origin;
    expect(origin.distanceTo(new THREE.Vector3(0, 1, 1))).toBeLessThan(0.15);
    expect(origin.distanceTo(new THREE.Vector3(-1, 1, 1))).toBeGreaterThan(0.5);
    expect(origin.distanceTo(new THREE.Vector3(1, 1, 1))).toBeGreaterThan(0.5);
    handler.dispose();
  });

  it('applies camera face align without changing the grid', () => {
    const world = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    world.add(mesh);
    const scene = new THREE.Scene();
    scene.add(world);
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
    const status = vi.fn();
    const orientationCoordinator = new CoordinatorEditorOrientation({
      getViewports: () => [],
      showStatusMessage: status,
    });
    const cameraSpy = vi.spyOn(orientationCoordinator, 'alignCameraToFace');
    const handler = new HandlerGridOrientation({
      worldObject: world,
      orientationCoordinator,
      getViewports: () => [],
      getPrimaryScene: () => scene,
      showStatusMessage: status,
    });
    handler.armCameraAlignPick();
    const applied = handler.tryAlignPickAtPointer(100, 100, camera, pickElement);
    expect(applied).toBe(true);
    expect(cameraSpy).toHaveBeenCalledTimes(1);
    expect(orientationCoordinator.getGridOrientation().isDefault()).toBe(true);
    handler.dispose();
  });
});
