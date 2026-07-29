import { describe, it, expect } from 'vitest';
import { SolidBrushFactory } from '../../src/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '../../src/solid/model/solid_brush_instance.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidCsgTree } from '../../src/solid/algorithm/solid_csg_tree.js';
import { SolidRoutingTableCache } from '../../src/solid/algorithm/solid_routing_table_cache.js';
import type { PreparedBrush } from '../../src/solid/algorithm/solid_compile_types.js';
import { SurfaceCategory } from '../../src/solid/types/surface_category.js';
import { DeleteSolidBrushesCommand } from '../../src/commands/solid/delete_solid_brushes_command.js';

/**
 * Builds a prepared brush at a local position.
 *
 * @param id Brush id.
 * @param size Box size.
 * @param operation CSG operation.
 * @param x Local X position.
 * @returns Prepared brush.
 */
function makePrepared(id: string, size: number, operation: SolidOperation, x: number): PreparedBrush {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  instance.position.set(x, 0, 0);
  const modelBrush = instance.getModelSpaceBrush();
  return {
    instance,
    brush: modelBrush,
    bounds: modelBrush.computeLocalBounds(),
    overlappingPeerIndices: [],
    operation,
  };
}

/**
 * Counts result mesh vertices for a solid model.
 *
 * @param model Solid model.
 * @returns Position attribute count.
 */
function resultVertexCount(model: SolidModel): number {
  return model.getResultMesh().geometry.getAttribute('position')?.count ?? 0;
}

/**
 * Routing-table cache must not reuse tables after prepared indices shift
 * (delete/insert), and deleting a brush must not wipe unrelated solid
 * geometry.
 */
describe('Solid routing table cache regression', () => {
  it('does not reuse a table when subject prepared index shifts but peer index stays', () => {
    const cache = new SolidRoutingTableCache();
    // Indices: 0 filler, 1 peer, 2 middle, 3 subject
    const preparedBefore = [
      makePrepared('filler', 1, SolidOperation.Additive, -10),
      makePrepared('peer', 2, SolidOperation.Additive, 0),
      makePrepared('middle', 1, SolidOperation.Additive, 5),
      makePrepared('subject', 2, SolidOperation.Additive, 0.5),
    ];
    preparedBefore[3]!.overlappingPeerIndices = [1];
    preparedBefore[1]!.overlappingPeerIndices = [3];
    const treeBefore = SolidCsgTree.fromPreparedFlat(preparedBefore);
    const tableBefore = cache.getOrBuild(preparedBefore, 3, treeBefore, false, false);
    // Delete middle (index 2): peer stays at 1, subject moves from 3 → 2
    const preparedAfter = [
      preparedBefore[0]!,
      preparedBefore[1]!,
      preparedBefore[3]!, // subject now at index 2
    ];
    preparedAfter[2]!.overlappingPeerIndices = [1];
    preparedAfter[1]!.overlappingPeerIndices = [2];
    const treeAfter = SolidCsgTree.fromPreparedFlat(preparedAfter);
    const tableAfter = cache.getOrBuild(preparedAfter, 2, treeAfter, false, false);
    // Must rebuild: subject step preparedIndex must be 2, not stale 3
    const subjectSteps = tableAfter.steps.filter((step) => step.preparedIndex === 2);
    expect(subjectSteps.length).toBe(1);
    expect(tableAfter.steps.some((step) => step.preparedIndex === 3)).toBe(false);
    // SelfAligned on subject must keep surface (additive, peer outside classify)
    const category = tableAfter.route((preparedIndex) => {
      if (preparedIndex === 2) return SurfaceCategory.SelfAligned;
      return SurfaceCategory.Outside;
    });
    expect(category).toBe(SurfaceCategory.SelfAligned);
    // Stale table would classify wrong and often discard
    const staleCategory = tableBefore.route((preparedIndex) => {
      if (preparedIndex === 2) return SurfaceCategory.SelfAligned;
      return SurfaceCategory.Outside;
    });
    // Stale table has subject at index 3; SelfAligned never applied for index 2
    expect(staleCategory).not.toBe(SurfaceCategory.SelfAligned);
  });

  it('keeps unrelated additive brushes after deleting a middle brush in a chain', () => {
    const model = new SolidModel('DeleteChain');
    const brushes: ReturnType<SolidModel['addBoxBrush']>[] = [];
    for (let index = 0; index < 8; index++) {
      const brush = model.addBoxBrush(1.5, SolidOperation.Additive);
      brush.position.set(index * 2.5, 0, 0);
      brush.pushTransformToMesh();
      brushes.push(brush);
    }
    // Overlapping pair in the middle so CSG has peers
    brushes[3]!.position.set(3 * 2.5 - 0.4, 0, 0);
    brushes[3]!.pushTransformToMesh();
    brushes[4]!.position.set(4 * 2.5, 0, 0);
    brushes[4]!.pushTransformToMesh();
    model.rebuild(true);
    const beforeVerts = brushes.map((brush) => {
      const polys = model['pipeline']['compiler'].getCachedPolygons(brush.id);
      return polys?.length ?? 0;
    });
    expect(beforeVerts.every((count) => count > 0)).toBe(true);
    const beforeTotal = resultVertexCount(model);
    expect(beforeTotal).toBeGreaterThan(0);
    const remove = brushes[2]!;
    const command = new DeleteSolidBrushesCommand([remove.mesh!]);
    command.execute();
    expect(model.getBrushCount()).toBe(7);
    for (const brush of brushes) {
      if (brush.id === remove.id) continue;
      const polys = model['pipeline']['compiler'].getCachedPolygons(brush.id);
      expect(polys?.length ?? 0, `brush ${brush.name} lost polygons after delete`).toBeGreaterThan(0);
    }
    expect(resultVertexCount(model)).toBeGreaterThan(0);
    // Moving a survivor must keep geometry
    const survivor = brushes[5]!;
    survivor.position.x += 0.25;
    survivor.pushTransformToMesh();
    model.markBrushesDirty([survivor.id]);
    model.rebuild(true);
    const survivorPolys = model['pipeline']['compiler'].getCachedPolygons(survivor.id);
    expect(survivorPolys?.length ?? 0).toBeGreaterThan(0);
    expect(resultVertexCount(model)).toBeGreaterThan(0);
  });

  it('refills additive volume when a subtractive peer is deleted', () => {
    const model = new SolidModel('DeleteSub');
    const outer = model.addBoxBrush(4, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive);
    model.rebuild(true);
    const withHole = resultVertexCount(model);
    const command = new DeleteSolidBrushesCommand([cutter.mesh!]);
    command.execute();
    expect(model.findBrush(outer.id)).toBeDefined();
    const outerPolys = model['pipeline']['compiler'].getCachedPolygons(outer.id);
    expect(outerPolys?.length ?? 0).toBeGreaterThan(0);
    const after = resultVertexCount(model);
    expect(after).toBeGreaterThan(0);
    // Closed box typically has fewer verts than a holed solid
    expect(after).not.toBe(withHole);
  });
});
