import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Grids } from '@/viewports/grid/grids.js';

describe('Grids facade', () => {
  it('should create a root group for orthographic grids', () => {
    const grids = new Grids(50, 50, 'xz', 'orthographic');
    expect(grids.getScene()).toBeInstanceOf(THREE.Group);
    expect(grids.getScene().children.length).toBeGreaterThan(0);
  });

  it('should create a root group for perspective grids', () => {
    const grids = new Grids(50, 50, 'xz', 'perspective');
    expect(grids.getScene().children.length).toBeGreaterThan(0);
  });

  it('should remember plane orientation', () => {
    const grids = new Grids(50, 50, 'yz', 'orthographic');
    expect(grids.getPlane()).toBe('yz');
  });
});
