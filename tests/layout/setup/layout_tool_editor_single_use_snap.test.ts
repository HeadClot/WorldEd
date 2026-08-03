import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { createLayoutToolEditorSystem } from '@/layout/setup/layout_tool_editor_setup.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ManagerInput } from '@/input/manager_input.js';
import { Theme } from '@/theme.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GizmoRaycaster } from '@/transform/gizmo/gizmo_raycaster.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { HandlerTransform } from '@/transform/core/handler_transform.js';
import { TransformConstraint } from '@/transform/core/transform_constraint.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { CommandStack } from '@/commands/command_stack.js';
import { TransformMode } from '@/types/transform_mode.js';

describe('layout tool editor single-use Shift snap precision', () => {
  let gridSnap: GridSnap;
  let inputManager: ManagerInput;
  let selectionManager: ManagerSelection;
  let transformHandler: HandlerTransform;
  let transformGizmo: GizmoTransform;
  let mesh: THREE.Mesh;
  let pickElement: HTMLElement;
  let camera: THREE.PerspectiveCamera;
  let services: ReturnType<typeof createLayoutToolEditorSystem>['editorWindow'] extends {
    getServices(): infer S;
  }
    ? NonNullable<S>
    : never;

  beforeEach(() => {
    gridSnap = new GridSnap(true, 1);
    inputManager = new ManagerInput();
    selectionManager = new ManagerSelection();
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.position.set(0.4, 0, 0);
    mesh.updateMatrixWorld(true);
    selectionManager.selectObject(mesh);
    transformGizmo = new GizmoTransform(Theme);
    transformGizmo.setMode(TransformMode.TRANSLATE);
    const executor = new TransformExecutor(gridSnap);
    transformHandler = new HandlerTransform(
      transformGizmo,
      new GizmoRaycaster(),
      executor,
      new TransformConstraint(),
      new CommandStack(16),
    );
    pickElement = document.createElement('div');
    Object.defineProperty(pickElement, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }),
    });
    camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const system = createLayoutToolEditorSystem({
      transformHandler,
      transformGizmo,
      selectionManager,
      inputManager,
      gridSnap,
      getUserSnapEnabled: () => true,
      getActiveViewport: () =>
        ({
          getCamera: () => camera,
          getContentElement: () => pickElement,
        }) as never,
      getInteractiveViewports: () => [],
      getTransformPivot: () => new THREE.Vector3(0, 0, 0),
      setStatusMessage: () => undefined,
      refreshGizmoPresentation: () => undefined,
      onAfterTransformCommit: () => undefined,
    });
    const resolved = system.editorWindow.getServices();
    if (!resolved) {
      throw new Error('expected editor services');
    }
    services = resolved as typeof services;
  });

  afterEach(() => {
    inputManager.dispose();
  });

  it('does not inherit sticky snap-off from a prior Shift-disabled sample when Shift is up', () => {
    gridSnap.setEnabled(false);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }));
    const started = services.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      [mesh],
      new THREE.Vector3(0, 0, 0),
      camera,
      pickElement,
      400,
      300,
    );
    expect(started).toBe(true);
    expect(gridSnap.isEnabled()).toBe(true);
    services.applySingleUsePointerMove(420, 310, camera, pickElement);
    expect(gridSnap.isEnabled()).toBe(true);
    services.cancelActiveTransformDrag();
  });

  it('disables snap while Shift is held during single-use pointer samples', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    const started = services.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      [mesh],
      new THREE.Vector3(0, 0, 0),
      camera,
      pickElement,
      400,
      300,
    );
    expect(started).toBe(true);
    expect(gridSnap.isEnabled()).toBe(false);
    services.applySingleUsePointerMove(420, 310, camera, pickElement);
    expect(gridSnap.isEnabled()).toBe(false);
    services.cancelActiveTransformDrag();
  });

  it('restores user snap preference when single-use drag commits or cancels', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    services.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      [mesh],
      new THREE.Vector3(0, 0, 0),
      camera,
      pickElement,
      400,
      300,
    );
    expect(gridSnap.isEnabled()).toBe(false);
    services.cancelActiveTransformDrag();
    expect(gridSnap.isEnabled()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    services.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      [mesh],
      new THREE.Vector3(0, 0, 0),
      camera,
      pickElement,
      400,
      300,
    );
    services.commitActiveTransformDrag();
    expect(gridSnap.isEnabled()).toBe(true);
  });
});
