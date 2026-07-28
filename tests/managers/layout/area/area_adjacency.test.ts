import { describe, expect, it } from 'vitest';
import { listSharedBorders } from '../../../../src/managers/layout/area/area_adjacency.js';
import { listAreaLeafPlacements } from '../../../../src/managers/layout/area/area_layout_tree.js';
import { createQuadLayout } from '../../../../src/managers/layout/area/area_layout_presets.js';

describe('area_adjacency', () => {
  it('should report four shared borders for the classic quad', () => {
    const placements = listAreaLeafPlacements(createQuadLayout());
    const borders = listSharedBorders(placements);
    // top-front, top-side, front-perspective, side-perspective
    expect(borders).toHaveLength(4);
  });
});
