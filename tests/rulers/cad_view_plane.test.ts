import { describe, it, expect } from 'vitest';
import {
  getCadViewPlaneAxes,
  getHiddenBoundsAxesForViewPlane,
  isCadMeasureAxisVisible,
} from '../../src/rulers/cad_view_plane.js';

describe('cad_view_plane', () => {
  it('should treat Y as depth in the top view', () => {
    expect(getCadViewPlaneAxes('xz').depthAxis).toBe(1);
    expect(isCadMeasureAxisVisible('xz', 1)).toBe(false);
    expect(isCadMeasureAxisVisible('xz', 0)).toBe(true);
    expect(isCadMeasureAxisVisible('xz', 2)).toBe(true);
    expect(getHiddenBoundsAxesForViewPlane('xz')).toEqual(['y']);
  });

  it('should treat Z as depth in the front view', () => {
    expect(getCadViewPlaneAxes('xy').depthAxis).toBe(2);
    expect(isCadMeasureAxisVisible('xy', 2)).toBe(false);
    expect(getHiddenBoundsAxesForViewPlane('xy')).toEqual(['z']);
  });

  it('should treat X as depth in the side view', () => {
    expect(getCadViewPlaneAxes('yz').depthAxis).toBe(0);
    expect(isCadMeasureAxisVisible('yz', 0)).toBe(false);
    expect(getHiddenBoundsAxesForViewPlane('yz')).toEqual(['x']);
  });

  it('should show every axis in perspective', () => {
    expect(getCadViewPlaneAxes('xyz').depthAxis).toBeNull();
    expect(isCadMeasureAxisVisible('xyz', 0)).toBe(true);
    expect(isCadMeasureAxisVisible('xyz', 1)).toBe(true);
    expect(isCadMeasureAxisVisible('xyz', 2)).toBe(true);
    expect(getHiddenBoundsAxesForViewPlane('xyz')).toEqual([]);
  });
});
