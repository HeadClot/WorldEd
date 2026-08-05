import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ComponentEditCageOverlay } from '@/edit/component/component_edit_cage_overlay.js';

describe('ComponentEditCageOverlay', () => {
  it('draws vertex dots after transparent cage wires so selection stays visible', () => {
    const scene = new THREE.Scene();
    const overlay = new ComponentEditCageOverlay(scene);
    const group = scene.children.find((child) => child.userData['isEditComponentCage'] === true);
    expect(group).toBeInstanceOf(THREE.Group);
    if (!(group instanceof THREE.Group)) {
      return;
    }
    const points = group.children.find((child) => child instanceof THREE.Points);
    const lines = group.children.filter((child) => child instanceof THREE.LineSegments);
    expect(points).toBeInstanceOf(THREE.Points);
    expect(lines.length).toBeGreaterThan(0);
    if (!(points instanceof THREE.Points)) {
      return;
    }
    const pointMaterial = points.material as THREE.PointsMaterial;
    expect(pointMaterial.transparent).toBe(true);
    expect(pointMaterial.opacity).toBe(1);
    expect(pointMaterial.depthWrite).toBe(false);
    for (const line of lines) {
      expect(points.renderOrder).toBeGreaterThan(line.renderOrder);
    }
    overlay.dispose();
  });
});
