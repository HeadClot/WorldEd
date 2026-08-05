import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { applyComponentTranslationDelta } from '@/edit/transform/component_transform_apply.js';
import type { ComponentTransformBrushVertex } from '@/edit/transform/component_transform_vertex.js';
import { buildBrushEditCage } from '@/edit/brush/brush_edit_cage.js';
import { SolidBrushValidator } from '@/solid/brush/solid_brush_validator.js';

describe('component transform brush CSG refresh', () => {
  it('updates brush hull and CSG result immediately after a face-extruding vertex move', () => {
    const model = new SolidModel('BrushVertEdit');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const brush = instance.brush;
    const mesh = instance.mesh;
    expect(mesh).toBeTruthy();
    if (!mesh) {
      return;
    }
    const beforeResultMaxX = readGeometryMaxX(model.getResultMesh().geometry);
    const positiveXVertices = findVertexIndicesWithMaxX(brush.vertices);
    expect(positiveXVertices.length).toBeGreaterThanOrEqual(4);
    const transformVertices: ComponentTransformBrushVertex[] = positiveXVertices.map((vertexIndex) => ({
      kind: 'brush' as const,
      targetId: instance.id,
      vertexIndex,
      solidModel: model,
      brushId: instance.id,
      brush,
      mesh,
      initialLocal: brush.vertices[vertexIndex]!.clone(),
    }));
    applyComponentTranslationDelta(transformVertices, new THREE.Vector3(0.75, 0, 0));
    expect(SolidBrushValidator.validate(brush).valid).toBe(true);
    expect(mesh.userData['solidBrushNonConvex']).not.toBe(true);
    const hullMaxX = readGeometryMaxX(mesh.geometry);
    expect(hullMaxX).toBeCloseTo(1 + 0.75, 4);
    const afterAttrMaxX = readGeometryMaxX(model.getResultMesh().geometry);
    expect(afterAttrMaxX).toBeGreaterThan(beforeResultMaxX + 0.5);
    const cage = buildBrushEditCage(model, instance, instance.id);
    for (const vertexIndex of positiveXVertices) {
      expect(cage.worldPositions[vertexIndex]!.x).toBeCloseTo(brush.vertices[vertexIndex]!.x, 5);
    }
  });

  it('force rebuild also picks up a face-extruding shape change', () => {
    const model = new SolidModel('BrushVertForce');
    const instance = model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const brush = instance.brush;
    const beforeMaxX = readGeometryMaxX(model.getResultMesh().geometry);
    for (const vertexIndex of findVertexIndicesWithMaxX(brush.vertices)) {
      brush.vertices[vertexIndex]!.x += 0.75;
    }
    brush.recalculatePlanes();
    model.markBrushesDirty([instance.id]);
    model.rebuild(true);
    expect(readGeometryMaxX(model.getResultMesh().geometry)).toBeGreaterThan(beforeMaxX + 0.5);
  });
});

/**
 * Finds all brush vertices that share the maximum local X (one face of a box).
 *
 * @param vertices Brush vertices.
 * @returns Vertex indices on the +X face.
 */
function findVertexIndicesWithMaxX(vertices: readonly THREE.Vector3[]): number[] {
  let bestX = -Infinity;
  for (const vertex of vertices) {
    bestX = Math.max(bestX, vertex.x);
  }
  const indices: number[] = [];
  for (let index = 0; index < vertices.length; index++) {
    if (Math.abs(vertices[index]!.x - bestX) < 1e-6) {
      indices.push(index);
    }
  }
  return indices;
}

/**
 * Returns the maximum X component of a geometry position attribute.
 *
 * @param geometry Buffer geometry.
 * @returns Max X, or -Infinity when empty.
 */
function readGeometryMaxX(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  let maxX = -Infinity;
  for (let index = 0; index < position.count; index++) {
    maxX = Math.max(maxX, position.getX(index));
  }
  return maxX;
}
