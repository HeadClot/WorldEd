import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Theme } from '@/theme.js';
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
});
