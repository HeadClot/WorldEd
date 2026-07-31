import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { resolveInspectorObjects, resolveTransformTargets } from '@/selection/object/resolve_transform_targets.js';

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

  it('prefers an outliner group as the unitary transform target', () => {
    const group = new THREE.Group();
    group.name = 'Folder';
    const childA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const childB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    group.add(childA);
    group.add(childB);
    const targets = resolveTransformTargets([childA, childB], [group]);
    expect(targets).toEqual([group]);
  });

  it('prefers a solid CSG group over nested brush meshes', () => {
    const model = new SolidModel('CsgGroupTarget');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group);
    model.root.add(group);
    group.add(brush.mesh!);
    const targets = resolveTransformTargets([brush.mesh!], [group]);
    expect(targets).toEqual([group]);
    expect(targets[0]).not.toBe(brush.mesh);
  });

  it('keeps uncovered meshes when hierarchy also selects a separate mesh', () => {
    const group = new THREE.Group();
    const nested = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    group.add(nested);
    const free = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const targets = resolveTransformTargets([nested, free], [group, free]);
    expect(targets).toContain(group);
    expect(targets).toContain(free);
    expect(targets).not.toContain(nested);
  });
});
