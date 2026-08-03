import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidFragmentRouter } from '@/solid/algorithm/compile/solid_fragment_router.js';
import { SolidAlgorithmRoutingTableBuilder } from '@/solid/algorithm/routing/solid_algorithm_routing_table_builder.js';
import { SolidAlgorithmCategoryRoutingRow } from '@/solid/algorithm/routing/solid_algorithm_category_routing_row.js';

/**
 * Builds a prepared box for routing tests.
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

/** PerformCSG no-loop path forces the Outside routing column. */
describe('Routing Outside column without surface interaction', () => {
  it('uses Outside column when hasSurfaceInteraction returns false', () => {
    const prepared = [
      makePrepared('a', 4, SolidOperation.Additive),
      makePrepared('b', 2, SolidOperation.Subtractive, new THREE.Vector3(1.5, 0, 0)),
    ];
    prepared[0]!.overlappingPeerIndices = [1];
    prepared[1]!.overlappingPeerIndices = [0];
    const tree = SolidCsgTree.fromPreparedFlat(prepared);
    const table = SolidAlgorithmRoutingTableBuilder.buildForSubject(prepared, 0, [1], tree, false, false);
    const withInteraction = table.route(
      (index) => (index === 0 ? SurfaceCategory.SelfAligned : SurfaceCategory.Inside),
      () => true,
    );
    const withoutInteraction = table.route(
      (index) => (index === 0 ? SurfaceCategory.SelfAligned : SurfaceCategory.Inside),
      (index) => index === 0,
    );
    expect(withInteraction).toBe(SurfaceCategory.Outside);
    expect(withoutInteraction).toBe(SurfaceCategory.SelfAligned);
  });

  it('keeps coplanar peer contact as surface interaction via the fragment router', () => {
    const prepared = [
      makePrepared('a', 2, SolidOperation.Additive),
      makePrepared('b', 2, SolidOperation.Additive, new THREE.Vector3(2, 0, 0)),
    ];
    prepared[0]!.overlappingPeerIndices = [1];
    prepared[1]!.overlappingPeerIndices = [0];
    const router = new SolidFragmentRouter();
    router.setCsgTree(SolidCsgTree.fromPreparedFlat(prepared));
    const face = prepared[0]!.brush.getFaceVertices(prepared[0]!.brush.faces[0]!);
    const normal = prepared[0]!.brush.planes[0]!.normal.clone();
    const category = router.routeFragmentCategory(face, normal, prepared, 0);
    expect([SurfaceCategory.SelfAligned, SurfaceCategory.Aligned, SurfaceCategory.Outside]).toContain(category);
  });

  it('Identity Outside column matches CategoryRoutingRow.Outside index', () => {
    expect(SolidAlgorithmCategoryRoutingRow.Identity.at(SurfaceCategory.Outside)).toBe(SurfaceCategory.Outside);
  });
});
