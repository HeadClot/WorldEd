import { describe, expect, it } from 'vitest';
import { isGizmoAxisHiddenInViewPlane } from '../../../src/transform/gizmo/gizmo_view_plane_axes.js';
import { GizmoAxis } from '../../../src/types/transform_mode.js';

describe('isGizmoAxisHiddenInViewPlane', () => {
  it('hides the Global depth axis in each orthographic view', () => {
    expect(isGizmoAxisHiddenInViewPlane(GizmoAxis.Y, 'xz', true)).toBe(true);
    expect(isGizmoAxisHiddenInViewPlane(GizmoAxis.X, 'xz', true)).toBe(false);
    expect(isGizmoAxisHiddenInViewPlane(GizmoAxis.Z, 'xz', true)).toBe(false);
    expect(isGizmoAxisHiddenInViewPlane(GizmoAxis.Z, 'xy', true)).toBe(true);
    expect(isGizmoAxisHiddenInViewPlane(GizmoAxis.X, 'yz', true)).toBe(true);
  });

  it('never hides axes in Local space or perspective', () => {
    expect(isGizmoAxisHiddenInViewPlane(GizmoAxis.Y, 'xz', false)).toBe(false);
    expect(isGizmoAxisHiddenInViewPlane(GizmoAxis.Y, 'xyz', true)).toBe(false);
    expect(isGizmoAxisHiddenInViewPlane(GizmoAxis.X, 'xyz', true)).toBe(false);
  });
});
