import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import {
  resolveInspectorObjects,
  resolveTransformTargets,
} from '../../../src/selection/object/resolve_transform_targets.js';

describe('resolveTransformTargets', () => {
  it('maps solid result meshes to the solid model root', () => {
    const model = new SolidModel('SolidTarget');
    model.addBoxBrush(2, SolidOperation.Additive);
    const result = model.getResultMesh();
    const targets = resolveTransformTargets([result]);
    expect(targets).toEqual([model.root]);
  });

  it('leaves ordinary meshes unchanged', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    expect(resolveTransformTargets([mesh])).toEqual([mesh]);
  });

  it('maps solid results to the solid root for inspector binding', () => {
    const model = new SolidModel('SolidInspect');
    model.addBoxBrush(2, SolidOperation.Additive);
    expect(resolveInspectorObjects([model.getResultMesh()])).toEqual([model.root]);
  });
});
