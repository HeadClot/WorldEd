import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { MeshDocument } from '@/mesh/document/mesh_document.js';
import { MeshTopologyBuilder } from '@/mesh/topology/mesh_topology_builder.js';
import { CommandComponentPositions } from '@/edit/transform/command_component_positions.js';
import type { ComponentTransformMeshVertex } from '@/edit/transform/component_transform_vertex.js';
import { readComponentTransformVertexLocal } from '@/edit/transform/component_transform_vertex.js';

/**
 * Builds a single-triangle mesh transform vertex for command tests.
 *
 * @returns Mesh vertex descriptor.
 */
function createMeshTransformVertex(): ComponentTransformMeshVertex {
  const builder = new MeshTopologyBuilder();
  const a = builder.appendVertex(0, 0, 0);
  const b = builder.appendVertex(1, 0, 0);
  const c = builder.appendVertex(0, 1, 0);
  builder.appendFace([a, b, c]);
  const document = new MeshDocument(builder.build());
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  const vertex: ComponentTransformMeshVertex = {
    kind: 'mesh',
    targetId: 'mesh-1',
    vertexIndex: 0,
    mesh,
    document,
    initialLocal: new THREE.Vector3(0, 0, 0),
  };
  return vertex;
}

describe('CommandComponentPositions', () => {
  it('restores vertex positions on undo and re-applies them on redo', () => {
    const vertex = createMeshTransformVertex();
    const positions = vertex.document.getTopology().getPositions();
    positions[0] = 2;
    positions[1] = 0;
    positions[2] = 0;
    const presentation = vi.fn();
    const command = new CommandComponentPositions([vertex], presentation);
    command.undo();
    expect(readComponentTransformVertexLocal(vertex).x).toBeCloseTo(0, 5);
    expect(presentation).toHaveBeenCalledTimes(1);
    command.execute();
    expect(readComponentTransformVertexLocal(vertex).x).toBeCloseTo(2, 5);
    expect(presentation).toHaveBeenCalledTimes(2);
  });
});
