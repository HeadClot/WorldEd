import { describe, it, expect } from 'vitest';
import { Theme } from '@/theme.js';
import { GizmoBuilderBase } from '@/transform/gizmo/gizmo_builder_base.js';
import { GizmoTranslate } from '@/transform/gizmo/gizmo_translate.js';
import { GizmoRotate } from '@/transform/gizmo/gizmo_rotate.js';
import { GizmoScale } from '@/transform/gizmo/gizmo_scale.js';

/**
 * Verifies mode gizmos share the builder base API without changing public
 * handle construction contracts used by GizmoTransform.
 */
describe('GizmoBuilderBase', () => {
  it('is the shared base for translate, rotate, and scale builders', () => {
    expect(new GizmoTranslate(Theme)).toBeInstanceOf(GizmoBuilderBase);
    expect(new GizmoRotate(Theme)).toBeInstanceOf(GizmoBuilderBase);
    expect(new GizmoScale(Theme)).toBeInstanceOf(GizmoBuilderBase);
  });

  it('returns scene roots matching createHandles registration', () => {
    const translate = new GizmoTranslate(Theme);
    const handles = translate.createHandles();
    const roots = translate.getAllSceneObjects();
    expect(handles.length).toBe(4);
    expect(roots.length).toBe(4);
    translate.dispose();
    expect(translate.getAllSceneObjects().length).toBe(0);
  });

  it('returns four handles for rotate and scale (axes plus free VIEW control)', () => {
    const rotate = new GizmoRotate(Theme);
    const scale = new GizmoScale(Theme);
    expect(rotate.createHandles().length).toBe(4);
    expect(rotate.getAllSceneObjects().length).toBe(4);
    expect(scale.createHandles().length).toBe(4);
    // Free scale registers one VIEW handle but two scene roots (cube + ring).
    expect(scale.getAllSceneObjects().length).toBe(5);
    rotate.dispose();
    scale.dispose();
  });
});
