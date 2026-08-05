import { describe, it, expect } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { buildBrushEditCage } from '@/edit/brush/brush_edit_cage.js';

describe('buildBrushEditCage', () => {
  it('builds world vertices and undirected edges from wing-edge topology', () => {
    const model = new SolidModel('CageTest');
    const instance = model.addBoxBrush(1);
    const cage = buildBrushEditCage(model, instance, `brush:${instance.id}`);
    expect(cage.worldPositions).toHaveLength(8);
    expect(cage.edges.length).toBeGreaterThanOrEqual(12);
    expect(cage.faces).toHaveLength(6);
  });
});
