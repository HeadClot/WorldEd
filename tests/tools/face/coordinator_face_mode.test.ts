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
  private contentElement: HTMLDivElement;
  cameraAccessCount = 0;

  /** @param ownerDocument Document that owns the pick element (main or popup). */
  constructor(ownerDocument: Document = document) {
    this.camera = new THREE.PerspectiveCamera();
    this.renderer = { domElement: ownerDocument.createElement('canvas') };
    this.scene = new THREE.Scene();
    this.contentElement = ownerDocument.createElement('div');
    ownerDocument.body?.appendChild(this.contentElement);
    this.contentElement.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  getCamera(): THREE.Camera {
    this.cameraAccessCount += 1;
    return this.camera;
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer as unknown as THREE.WebGLRenderer;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getContentElement(): HTMLElement {
    return this.contentElement;
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

  it('should pick the detached document viewport when ownerDocument is set', () => {
    const mainViewport = new MockViewport(document);
    const detachedDocument = document.implementation.createHTMLDocument('detached-viewport');
    const detachedViewport = new MockViewport(detachedDocument);
    const multiCoordinator = new CoordinatorFaceMode({
      getViewports: () => [mainViewport as never, detachedViewport as never],
      getPrimaryScene: () => mainViewport.getScene(),
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
    multiCoordinator.getFaceExtrusionController().setSelectionMode(SelectionMode.FACE);
    multiCoordinator.beginFaceSelectPointerDown(40, 50, false, false, detachedDocument);
    expect(detachedViewport.cameraAccessCount).toBeGreaterThan(0);
    expect(mainViewport.cameraAccessCount).toBe(0);
    multiCoordinator.endFaceSelectPointerUp();
  });
});
