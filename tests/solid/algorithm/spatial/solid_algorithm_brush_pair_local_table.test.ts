import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidAlgorithmBrushPairLocalTable } from '@/solid/algorithm/spatial/solid_algorithm_brush_pair_local_table.js';
import { SolidAlgorithmIntersectionType } from '@/solid/algorithm/routing/solid_algorithm_intersection_type.js';

/**
 * Builds a prepared box for pair-local-table tests.
 *
 * @param id Brush id.
 * @param size Box edge.
 * @param operation CSG operation.
 * @param position Optional position.
 * @returns Prepared brush.
 */
function makePrepared(id: string, size: number, operation: SolidOperation, position?: THREE.Vector3): PreparedBrush {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  if (position) {
    instance.position.copy(position);
  }
  const modelBrush = instance.getModelSpaceBrush();
  return {
    instance,
    brush: modelBrush,
    bounds: modelBrush.computeLocalBounds(),
    overlappingPeerIndices: [],
    operation,
  };
}

/** Chisel PrepareBrushPairIntersections local plane tables (once per pair). */
describe('SolidAlgorithmBrushPairLocalTable', () => {
  it('builds Intersection local planes once for overlapping peers', () => {
    const prepared = [
      makePrepared('a', 2, SolidOperation.Additive),
      makePrepared('b', 2, SolidOperation.Subtractive, new THREE.Vector3(1.5, 0, 0)),
    ];
    prepared[0]!.overlappingPeerIndices = [1];
    prepared[1]!.overlappingPeerIndices = [0];
    const table = SolidAlgorithmBrushPairLocalTable.buildForSubject(prepared, 0);
    const entry = table.get(1);
    expect(entry).toBeDefined();
    expect(entry!.type).toBe(SolidAlgorithmIntersectionType.Intersection);
    expect(entry!.peerCutPlanes.length).toBeGreaterThan(0);
    expect(entry!.peerCutPlanes.length).toBeLessThan(prepared[1]!.brush.planes.length);
  });

  it('returns empty peer cut planes for BInsideA pairs', () => {
    const prepared = [
      makePrepared('outer', 4, SolidOperation.Additive),
      makePrepared('inner', 1, SolidOperation.Subtractive),
    ];
    prepared[0]!.overlappingPeerIndices = [1];
    prepared[1]!.overlappingPeerIndices = [0];
    const table = SolidAlgorithmBrushPairLocalTable.buildForSubject(prepared, 0);
    const entry = table.get(1);
    expect(entry).toBeDefined();
    expect(entry!.type).toBe(SolidAlgorithmIntersectionType.BInsideA);
    expect(entry!.peerCutPlanes).toEqual([]);
  });

  it('omits non-spatial peers that are not in overlappingPeerIndices', () => {
    const prepared = [
      makePrepared('a', 2, SolidOperation.Additive),
      makePrepared('b', 2, SolidOperation.Additive, new THREE.Vector3(50, 0, 0)),
    ];
    prepared[0]!.overlappingPeerIndices = [];
    const table = SolidAlgorithmBrushPairLocalTable.buildForSubject(prepared, 0);
    expect(table.get(1)).toBeUndefined();
    expect(table.getAllEntries()).toHaveLength(0);
  });
});
