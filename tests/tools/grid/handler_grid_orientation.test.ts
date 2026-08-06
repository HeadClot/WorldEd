import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HandlerGridOrientation } from '@/tools/grid/handler_grid_orientation.js';
import { CoordinatorEditorOrientation } from '@/navigation/orientation/coordinator_editor_orientation.js';

describe('HandlerGridOrientation', () => {
  it('arms align pick and applies orientation when a face is hit', () => {
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
    const alignSpy = vi.spyOn(orientationCoordinator, 'alignGridToFace');
    const handler = new HandlerGridOrientation({
      worldObject: world,
      orientationCoordinator,
      getViewports: () => [],
      getPrimaryScene: () => scene,
      showStatusMessage: status,
    });
    handler.armAlignPick();
    expect(handler.isAlignPickArmed()).toBe(true);
    const applied = handler.tryAlignPickAtPointer(100, 100, camera, pickElement);
    expect(applied).toBe(true);
    expect(handler.isAlignPickArmed()).toBe(false);
    expect(alignSpy).toHaveBeenCalledTimes(1);
    const normal = alignSpy.mock.calls[0]?.[0] as THREE.Vector3;
    expect(normal.z).toBeGreaterThan(0.9);
    expect(orientationCoordinator.getCameraOrientation().isDefault()).toBe(true);
    handler.dispose();
  });

  it('reports when no face is under the pointer while armed', () => {
    const world = new THREE.Group();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 6);
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
    handler.armAlignPick();
    expect(handler.tryAlignPickAtPointer(100, 100, camera, pickElement)).toBe(false);
    expect(handler.isAlignPickArmed()).toBe(true);
    expect(status).toHaveBeenCalledWith('No face hit · click a mesh face');
    handler.dispose();
  });
});
