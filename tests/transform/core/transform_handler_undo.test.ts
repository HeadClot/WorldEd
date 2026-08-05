import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { TransformMode } from '@/types/transform_mode.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GizmoRaycaster } from '@/transform/gizmo/gizmo_raycaster.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { TransformConstraint } from '@/transform/core/transform_constraint.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { HandlerTransform } from '@/transform/core/handler_transform.js';
import { CommandStack } from '@/commands/command_stack.js';

describe('TransformHandler undo/redo', () => {
  let handler: HandlerTransform;
  let gizmo: GizmoTransform;
  let raycaster: GizmoRaycaster;
  let executor: TransformExecutor;
  let constraint: TransformConstraint;
  let commandStack: CommandStack;

  beforeEach(() => {
    constraint = new TransformConstraint();
    executor = new TransformExecutor(new GridSnap(false, 1.0));
    raycaster = new GizmoRaycaster();
    gizmo = new GizmoTransform(Theme);
    commandStack = new CommandStack(64);
    handler = new HandlerTransform(gizmo, raycaster, executor, constraint, commandStack);
  });

  it('should start with no commands in stack', () => {
    expect(commandStack.getUndoCount()).toBe(0);
    expect(commandStack.getRedoCount()).toBe(0);
  });

  it('should work without command stack', () => {
    const handlerNoStack = new HandlerTransform(gizmo, raycaster, executor, constraint, null);
    expect(handlerNoStack.isDragging()).toBe(false);
    expect(handlerNoStack.isBusy()).toBe(false);
  });

  it('should onPointerUp with no drag produce no command', () => {
    const pivot = new THREE.Vector3();
    handler.onPointerUp(pivot, []);
    expect(commandStack.getUndoCount()).toBe(0);
  });

  it('should onPointerDown not produce a command without a handle pick', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    const handles = gizmo.getHandles();
    const mockCanvas = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    };
    handler.onPointerDown(
      new THREE.PerspectiveCamera(),
      mockCanvas as unknown as HTMLElement,
      new MouseEvent('pointerdown', { clientX: 0, clientY: 0 }),
      handles,
      [mesh],
    );
    handler.onPointerUp(new THREE.Vector3(), [mesh]);
    expect(commandStack.getUndoCount()).toBe(0);
  });

  it('pushes undo for single-use typed rotate when angle snap would round 5 deg to zero', () => {
    const snapEnabledExecutor = new TransformExecutor(new GridSnap(true, 1.0, 15));
    const snapEnabledHandler = new HandlerTransform(gizmo, raycaster, snapEnabledExecutor, constraint, commandStack);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    const originalQuaternion = mesh.quaternion.clone();
    const pickElement = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    } as unknown as HTMLElement;
    const camera = new THREE.PerspectiveCamera();
    const pivot = new THREE.Vector3(0, 0, 0);
    expect(
      snapEnabledHandler.beginSingleUseDrag(TransformMode.ROTATE, [mesh], pivot, camera, pickElement, 100, 100),
    ).toBe(true);
    expect(snapEnabledHandler.handleModalKeyDown(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x' }))).toBe(true);
    expect(snapEnabledHandler.handleModalKeyDown(new KeyboardEvent('keydown', { code: 'Digit5', key: '5' }))).toBe(
      true,
    );
    expect(snapEnabledHandler.handleModalKeyDown(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }))).toBe(
      true,
    );
    expect(snapEnabledHandler.isDragging()).toBe(false);
    expect(commandStack.getUndoCount()).toBe(1);
    const euler = new THREE.Euler().setFromQuaternion(mesh.quaternion, 'XYZ');
    expect(euler.x).toBeCloseTo(THREE.MathUtils.degToRad(5), 5);
    expect(commandStack.undo()).toBe(true);
    expect(mesh.quaternion.angleTo(originalQuaternion)).toBeLessThan(1e-6);
  });

  it('pushes undo for single-use typed free scale when scale snap would round toward one', () => {
    const snapEnabledExecutor = new TransformExecutor(new GridSnap(true, 1.0, 15, 0.1));
    const snapEnabledHandler = new HandlerTransform(gizmo, raycaster, snapEnabledExecutor, constraint, commandStack);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x888888 }));
    const originalScale = mesh.scale.clone();
    const pickElement = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    } as unknown as HTMLElement;
    const camera = new THREE.PerspectiveCamera();
    const pivot = new THREE.Vector3(0, 0, 0);
    expect(
      snapEnabledHandler.beginSingleUseDrag(TransformMode.SCALE, [mesh], pivot, camera, pickElement, 100, 100),
    ).toBe(true);
    expect(snapEnabledHandler.handleModalKeyDown(new KeyboardEvent('keydown', { code: 'Digit1', key: '1' }))).toBe(
      true,
    );
    expect(snapEnabledHandler.handleModalKeyDown(new KeyboardEvent('keydown', { code: 'Period', key: '.' }))).toBe(
      true,
    );
    expect(snapEnabledHandler.handleModalKeyDown(new KeyboardEvent('keydown', { code: 'Digit0', key: '0' }))).toBe(
      true,
    );
    expect(snapEnabledHandler.handleModalKeyDown(new KeyboardEvent('keydown', { code: 'Digit5', key: '5' }))).toBe(
      true,
    );
    expect(snapEnabledHandler.handleModalKeyDown(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }))).toBe(
      true,
    );
    expect(commandStack.getUndoCount()).toBe(1);
    expect(mesh.scale.x).toBeCloseTo(1.05, 5);
    expect(mesh.scale.y).toBeCloseTo(1.05, 5);
    expect(mesh.scale.z).toBeCloseTo(1.05, 5);
    expect(commandStack.undo()).toBe(true);
    expect(mesh.scale.distanceTo(originalScale)).toBeLessThan(1e-6);
  });
});
