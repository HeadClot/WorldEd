import { describe, it, expect } from 'vitest';
import { GizmoAxis, TransformMode } from '@/types/transform_mode.js';
import { transformModalAxisToggleAllowed } from '@/transform/modal/transform_modal_axis_toggle_allowed.js';

describe('transformModalAxisToggleAllowed', () => {
  it('allows X Y Z during single-use for any mode', () => {
    expect(transformModalAxisToggleAllowed(TransformMode.TRANSLATE, null, true)).toBe(true);
    expect(transformModalAxisToggleAllowed(TransformMode.TRANSLATE, GizmoAxis.X, true)).toBe(true);
    expect(transformModalAxisToggleAllowed(TransformMode.ROTATE, GizmoAxis.VIEW, true)).toBe(true);
  });

  it('allows X Y Z on permanent translate only for the free-move center cube', () => {
    expect(transformModalAxisToggleAllowed(TransformMode.TRANSLATE, GizmoAxis.VIEW, false)).toBe(true);
    expect(transformModalAxisToggleAllowed(TransformMode.TRANSLATE, GizmoAxis.X, false)).toBe(false);
    expect(transformModalAxisToggleAllowed(TransformMode.TRANSLATE, GizmoAxis.Y, false)).toBe(false);
    expect(transformModalAxisToggleAllowed(TransformMode.TRANSLATE, GizmoAxis.Z, false)).toBe(false);
    expect(transformModalAxisToggleAllowed(TransformMode.TRANSLATE, GizmoAxis.XY_PLANE, false)).toBe(false);
    expect(transformModalAxisToggleAllowed(TransformMode.TRANSLATE, null, false)).toBe(false);
  });

  it('allows X Y Z on permanent scale only for the free-scale center cube', () => {
    expect(transformModalAxisToggleAllowed(TransformMode.SCALE, GizmoAxis.VIEW, false)).toBe(true);
    expect(transformModalAxisToggleAllowed(TransformMode.SCALE, GizmoAxis.X, false)).toBe(false);
    expect(transformModalAxisToggleAllowed(TransformMode.SCALE, GizmoAxis.Y, false)).toBe(false);
    expect(transformModalAxisToggleAllowed(TransformMode.SCALE, GizmoAxis.Z, false)).toBe(false);
    expect(transformModalAxisToggleAllowed(TransformMode.SCALE, null, false)).toBe(false);
  });

  it('allows X Y Z on permanent rotate only for the free-rotate sphere', () => {
    expect(transformModalAxisToggleAllowed(TransformMode.ROTATE, GizmoAxis.VIEW, false)).toBe(true);
    expect(transformModalAxisToggleAllowed(TransformMode.ROTATE, GizmoAxis.X, false)).toBe(false);
    expect(transformModalAxisToggleAllowed(TransformMode.ROTATE, GizmoAxis.Y, false)).toBe(false);
    expect(transformModalAxisToggleAllowed(TransformMode.ROTATE, null, false)).toBe(false);
  });

  it('allows X Y Z on permanent bounds regardless of handle', () => {
    expect(transformModalAxisToggleAllowed(TransformMode.BOUNDS, GizmoAxis.VIEW, false)).toBe(true);
    expect(transformModalAxisToggleAllowed(TransformMode.BOUNDS, GizmoAxis.X, false)).toBe(true);
  });
});
