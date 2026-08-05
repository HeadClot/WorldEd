import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  filterObjectsDeletableOutsideEditDomain,
  isObjectDeleteProtectedByEditDomain,
} from '@/edit/session/edit_mode_domain_protection.js';

describe('edit_mode_domain_protection', () => {
  it('protects domain meshes and their ancestors from delete', () => {
    const world = new THREE.Group();
    const group = new THREE.Group();
    const domainMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const otherMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    group.add(domainMesh);
    world.add(group);
    world.add(otherMesh);
    const domain = [{ kind: 'content_mesh' as const, mesh: domainMesh, targetId: domainMesh.uuid }];
    expect(isObjectDeleteProtectedByEditDomain(domainMesh, domain)).toBe(true);
    expect(isObjectDeleteProtectedByEditDomain(group, domain)).toBe(true);
    expect(isObjectDeleteProtectedByEditDomain(otherMesh, domain)).toBe(false);
    const allowed = filterObjectsDeletableOutsideEditDomain([domainMesh, group, otherMesh], domain);
    expect(allowed).toEqual([otherMesh]);
    domainMesh.geometry.dispose();
    otherMesh.geometry.dispose();
  });
});
