import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  getOrBuildSelectionEdgeGeometry,
  SELECTION_EDGE_DENSE_TRIANGLE_THRESHOLD,
} from '@/selection/object/selection_edge_geometry.js';
import { getTriangleCount } from '@/selection/pick/utils_triangle_geometry.js';

describe('selection_edge_geometry', () => {
  it('caches edge geometry for repeated selection of the same mesh', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const first = getOrBuildSelectionEdgeGeometry(mesh);
    const second = getOrBuildSelectionEdgeGeometry(mesh);
    expect(second).toBe(first);
    mesh.geometry.dispose();
  });

  it('uses a bounding-box outline for dense meshes', () => {
    const segments = Math.ceil(Math.sqrt(SELECTION_EDGE_DENSE_TRIANGLE_THRESHOLD / 2)) + 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10, segments, segments));
    expect(getTriangleCount(mesh.geometry)).toBeGreaterThanOrEqual(SELECTION_EDGE_DENSE_TRIANGLE_THRESHOLD);
    const edges = getOrBuildSelectionEdgeGeometry(mesh);
    const positions = edges.getAttribute('position');
    expect(positions.count).toBe(24);
    mesh.geometry.dispose();
  });
});
