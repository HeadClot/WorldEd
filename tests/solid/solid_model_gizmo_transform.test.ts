import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { resolveTransformTargets } from '@/selection/object/resolve_transform_targets.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { CommandTransformTranslate } from '@/transform/commands/command_transform_translate.js';
import { CommandTransformScale } from '@/transform/commands/command_transform_scale.js';
import { GizmoAxis } from '@/types/transform_mode.js';

/** Lightweight mock of the solid tools panel used by the controller. */
class MockSolidPanel {
  setModel(_model: SolidModel | null): void {
    void _model;
  }

  getModel(): SolidModel | null {
    return null;
  }

  refresh(): void {
    return;
  }
}

/**
 * Builds a solid model under a world group with one additive box brush.
 *
 * @returns Solid model ready for transform tests.
 */
function createSolidWithBrush(): SolidModel {
  const model = new SolidModel('GizmoSolid');
  model.addBoxBrush(2, SolidOperation.Additive);
  model.rebuild(true);
  return model;
}

/**
 * Creates a solid model controller with a fresh command stack.
 *
 * @param world World root group.
 * @returns Controller under test.
 */
function createController(world: THREE.Group): SolidModelController {
  return new SolidModelController(world, new CommandStack(16), new ManagerSelection(), new MockSolidPanel() as never);
}

describe('Solid model gizmo transform targets', () => {
  it('resolves solid result selection to the solid root for gizmo edits', () => {
    const model = createSolidWithBrush();
    const targets = resolveTransformTargets([model.getResultMesh()]);
    expect(targets).toEqual([model.root]);
  });

  it('translates the solid root without moving brushes relative to the root', () => {
    const model = createSolidWithBrush();
    const brush = model.getBrushes()[0]!;
    const brushLocalBefore = brush.mesh!.position.clone();
    const executor = new TransformExecutor(new GridSnap(false, 1));
    const initials = new Map<THREE.Object3D, THREE.Vector3>([[model.root, model.root.position.clone()]]);
    const delta = new THREE.Vector3(4, 0, 0);
    executor.applyAbsoluteTranslation([model.root], initials, delta);
    expect(model.root.position.x).toBeCloseTo(4, 5);
    expect(brush.mesh!.position.x).toBeCloseTo(brushLocalBefore.x, 5);
    expect(model.getResultMesh().position.lengthSq()).toBeCloseTo(0, 8);
  });

  it('undo restores solid root translation after a result-selection style move', () => {
    const model = createSolidWithBrush();
    const original = model.root.position.clone();
    const finalPosition = original.clone().add(new THREE.Vector3(3, 1, -2));
    const command = new CommandTransformTranslate(
      [{ object: model.root, position: original.clone(), finalPosition }],
      finalPosition.clone().sub(original),
    );
    command.execute();
    expect(model.root.position.x).toBeCloseTo(3, 5);
    command.undo();
    expect(model.root.position.distanceTo(original)).toBeLessThan(1e-8);
  });

  it('undo restores solid root scale without exploding brush sizes', () => {
    const model = createSolidWithBrush();
    const originalPosition = model.root.position.clone();
    const originalScale = model.root.scale.clone();
    const command = new CommandTransformScale(
      [{ object: model.root, originalPosition, originalScale }],
      model.root.position.clone(),
      new THREE.Vector3(1, 0, 0),
      2,
      GizmoAxis.X,
    );
    command.execute();
    expect(model.root.scale.x).toBeCloseTo(2, 5);
    command.undo();
    expect(model.root.scale.distanceTo(originalScale)).toBeLessThan(1e-8);
  });

  it('does not compound root pose when residual result transforms are baked live', () => {
    const world = new THREE.Group();
    const model = createSolidWithBrush();
    world.add(model.root);
    const controller = createController(world);
    const result = model.getResultMesh();
    const rootStart = model.root.position.clone();
    result.position.set(2, 0, 0);
    controller.onTransformsLive([result]);
    result.position.set(2, 0, 0);
    controller.onTransformsLive([result]);
    result.position.set(2, 0, 0);
    controller.onTransformsLive([result]);
    controller.onTransformsCommitted([result]);
    expect(model.root.position.x).toBeCloseTo(rootStart.x + 2, 5);
    expect(model.root.position.y).toBeCloseTo(rootStart.y, 5);
    expect(result.position.lengthSq()).toBeCloseTo(0, 8);
    expect(Math.abs(model.root.scale.x)).toBeLessThan(10);
  });

  it('commits a root-only solid move without requiring result-mesh residual bake', () => {
    const world = new THREE.Group();
    const model = createSolidWithBrush();
    world.add(model.root);
    const controller = createController(world);
    model.root.position.set(5, 0, 0);
    const solidOnly = controller.onTransformsCommitted([model.getResultMesh()]);
    expect(solidOnly).toBe(true);
    expect(model.root.position.x).toBeCloseTo(5, 5);
    expect(model.getResultMesh().position.lengthSq()).toBeCloseTo(0, 8);
  });

  it('recompiles solid result when a nested solid CSG group is moved as a unit', () => {
    const world = new THREE.Group();
    const model = new SolidModel('GroupMoveSolid');
    world.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(brush.mesh!);
    model.rebuild(true);
    const resultBefore = sampleResultWorldCenter(model);
    group.position.set(8, 0, 0);
    group.updateMatrixWorld(true);
    const controller = createController(world);
    controller.onTransformsCommitted([brush.mesh!]);
    const resultAfter = sampleResultWorldCenter(model);
    expect(group.position.x).toBeCloseTo(8, 5);
    expect(brush.mesh!.position.lengthSq()).toBeCloseTo(0, 8);
    expect(resultAfter.x).toBeCloseTo(resultBefore.x + 8, 4);
  });
});

/**
 * Samples the solid result mesh world-space bounding sphere center.
 *
 * @param model Solid model with compiled result geometry.
 * @returns World center of the result mesh bounds.
 */
function sampleResultWorldCenter(model: SolidModel): THREE.Vector3 {
  const result = model.getResultMesh();
  result.updateMatrixWorld(true);
  result.geometry.computeBoundingSphere();
  const center = result.geometry.boundingSphere!.center.clone();
  return center.applyMatrix4(result.matrixWorld);
}
