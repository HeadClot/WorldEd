import { describe, expect, it } from 'vitest';
import { checkAreaJoin, isJoinImpossibleForTree, listJoinableNeighbors } from '@/layout/area/policy_area_join.js';
import {
  createQuadLayout,
  createSinglePerspectiveLayout,
  DEFAULT_AREA_IDS,
} from '@/layout/area/area_layout_presets.js';

describe('area_join_policy', () => {
  it('should forbid join when only one area remains', () => {
    const root = createSinglePerspectiveLayout();
    expect(isJoinImpossibleForTree(root)).toBe(true);
    const check = checkAreaJoin(root, DEFAULT_AREA_IDS.perspective, DEFAULT_AREA_IDS.top);
    expect(check.allowed).toBe(false);
    expect(check.reason).toMatch(/only remaining/i);
  });

  it('should allow join for full-edge neighbors in the quad layout', () => {
    const root = createQuadLayout();
    const check = checkAreaJoin(root, DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.front);
    expect(check.allowed).toBe(true);
  });

  it('should reject diagonal non-edge pairs', () => {
    const root = createQuadLayout();
    const check = checkAreaJoin(root, DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.perspective);
    expect(check.allowed).toBe(false);
  });

  it('should list joinable neighbors for a corner pane', () => {
    const root = createQuadLayout();
    const neighbors = listJoinableNeighbors(root, DEFAULT_AREA_IDS.top);
    const ids = neighbors.map((item) => item.payload.areaId).sort();
    expect(ids).toEqual([DEFAULT_AREA_IDS.front, DEFAULT_AREA_IDS.side].sort());
  });
});
