import { describe, it, expect } from 'vitest';
import { classifyBrushShape, pickShapeTag, shapeMatchesFilter } from '../../../src/ai/client/editor_api_shape.js';

/** Unit tests for brush shape classification used by find/describe tools. */
describe('editor_api_shape', () => {
  it('classifies a thin vertical pole', () => {
    const size = { x: 0.5, y: 8, z: 0.5 };
    expect(pickShapeTag(size)).toBe('thin_pole');
    const info = classifyBrushShape(size, { x: 0, y: 4, z: 0 });
    expect(info.kind).toContain('pole');
    expect(info.summary).toContain('0.5');
  });

  it('classifies a flat panel or flag', () => {
    const size = { x: 2, y: 0.2, z: 3 };
    expect(pickShapeTag(size)).toBe('flat_panel');
    expect(shapeMatchesFilter('flat_panel', 'flag')).toBe(true);
    expect(shapeMatchesFilter('flat_panel', 'panel')).toBe(true);
  });

  it('matches tall filter for poles and tall volumes', () => {
    expect(shapeMatchesFilter('thin_pole', 'tall')).toBe(true);
    expect(shapeMatchesFilter('tall', 'tall')).toBe(true);
    expect(shapeMatchesFilter('box', 'tall')).toBe(false);
  });
});
