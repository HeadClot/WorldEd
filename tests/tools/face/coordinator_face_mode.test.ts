import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';

/** Minimal viewport stand-in for face mode coordinator wiring. */
class MockViewport {
  private camera: THREE.PerspectiveCamera;
  private renderer: { domElement: HTMLCanvasElement };
  private scene: THREE.Scene;
  faceSelectionCallback: ((event: MouseEvent) => boolean) | null = null;

  constructor() {
    this.camera = new THREE.PerspectiveCamera();
    this.renderer = { domElement: document.createElement('canvas') };
    this.scene = new THREE.Scene();
  }

  getCamera(): THREE.Camera {
    return this.camera;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer as unknown as THREE.WebGLRenderer;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  setFaceSelectionCallback(callback: (event: MouseEvent) => boolean): void {
    this.faceSelectionCallback = callback;
  }
}

describe('FaceModeCoordinator', () => {
  let selectionManager: ManagerSelection;
  let coordinator: CoordinatorFaceMode;
  let mesh: THREE.Mesh;
  let worldObject: THREE.Group;

  beforeEach(() => {
    selectionManager = new ManagerSelection();
    worldObject = new THREE.Group();
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    worldObject.add(mesh);
    selectionManager.selectObject(mesh);
    const viewport = new MockViewport();
    coordinator = new CoordinatorFaceMode({
      getViewports: () => [viewport as never],
      getPrimaryScene: () => viewport.getScene(),
      commandStack: new CommandStack(16),
      gridSnap: new GridSnap(false, 1),
      worldObject,
      selectionManager,
      statusBar: {
        setSelectionModeInfo: () => undefined,
      } as never,
      keyboardShortcutHandler: {
        setOnSelectionModeToggle: () => undefined,
        setOnExtrudeFaces: () => undefined,
        isKeyDown: () => false,
      } as never,
      showStatusMessage: vi.fn(),
      syncPrimitivesToViewports: () => undefined,
      updateShadingMeshes: () => undefined,
      refreshOutliner: () => undefined,
    });
  });

  it('should start in object selection mode', () => {
    expect(coordinator.getSelectionMode()).toBe(SelectionMode.OBJECT);
  });

  it('should clear object selection when entering face mode', () => {
    expect(selectionManager.getSelectedObjects().size).toBe(1);
    coordinator.getFaceExtrusionController().setSelectionMode(SelectionMode.FACE);
    expect(coordinator.getSelectionMode()).toBe(SelectionMode.FACE);
    expect(selectionManager.getSelectedObjects().size).toBe(0);
  });

  it('should not reintroduce object selection requirement in face mode', () => {
    coordinator.getFaceExtrusionController().setSelectionMode(SelectionMode.FACE);
    expect(selectionManager.getSelectedObjects().size).toBe(0);
    expect(coordinator.getFaceExtrusionController().getSelectionMode()).toBe(SelectionMode.FACE);
  });
});
