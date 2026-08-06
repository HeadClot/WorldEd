import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { writePersistentMeshDocument } from '@/mesh/document/mesh_document_binding.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import {
  forEachMeshOutlineEdgeLocalSegment,
  getOrBuildMeshOutlineEdgeLocalPositions,
} from '@/utils/mesh_outline_edge_segments.js';

/**
 * Counts outline segments in a packed local position buffer.
 *
 * @param localPositions Flat segment positions.
 * @returns Segment count.
 */
function countSegments(localPositions: Float32Array | null): number {
  if (!localPositions) {
    return 0;
  }
  return Math.floor(localPositions.length / 6);
}

/**
 * Returns true when a packed outline buffer contains a segment near the given
 * local endpoints (order-independent).
 *
 * @param localPositions Packed segments.
 * @param expectedA First endpoint.
 * @param expectedB Second endpoint.
 * @returns True when the edge is present.
 */
function hasSegmentNear(localPositions: Float32Array, expectedA: THREE.Vector3, expectedB: THREE.Vector3): boolean {
  let found = false;
  forEachMeshOutlineEdgeLocalSegment(localPositions, (ax, ay, az, bx, by, bz) => {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    const matchForward = a.distanceTo(expectedA) < 1e-5 && b.distanceTo(expectedB) < 1e-5;
    const matchReverse = a.distanceTo(expectedB) < 1e-5 && b.distanceTo(expectedA) < 1e-5;
    if (matchForward || matchReverse) {
      found = true;
    }
  });
  return found;
}

describe('mesh_outline_edge_segments', () => {
  it('excludes coplanar triangulation diagonals from a flat quad', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0]), 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const mesh = new THREE.Mesh(geometry);
    const localPositions = getOrBuildMeshOutlineEdgeLocalPositions(mesh);
    expect(countSegments(localPositions)).toBe(4);
    expect(hasSegmentNear(localPositions!, new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 2, 0))).toBe(false);
    expect(hasSegmentNear(localPositions!, new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0))).toBe(true);
  });

  it('uses n-gon MeshDocument edges when bound', () => {
    const builder = new MeshTopologyBuilder();
    const a = builder.appendVertex(0, 0, 0);
    const b = builder.appendVertex(3, 0, 0);
    const c = builder.appendVertex(3, 3, 0);
    const d = builder.appendVertex(0, 3, 0);
    builder.appendFace([a, b, c, d]);
    const document = new MeshDocument(builder.build());
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    writePersistentMeshDocument(mesh, document);
    const localPositions = getOrBuildMeshOutlineEdgeLocalPositions(mesh);
    expect(countSegments(localPositions)).toBe(4);
    expect(hasSegmentNear(localPositions!, new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 3, 0))).toBe(false);
    expect(hasSegmentNear(localPositions!, new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0))).toBe(true);
  });
});
