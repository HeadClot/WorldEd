import { describe, it, expect, vi } from 'vitest';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';

describe('EditorOverlayPolicy', () => {
  it('should deny overlays by default until a tool enables them', () => {
    const policy = new PolicyEditorOverlay();
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    expect(policy.isAllowed(EditorOverlayId.TRANSFORM_GIZMOS)).toBe(false);
  });

  it('should enable and release by reason without conflict across tools', () => {
    const policy = new PolicyEditorOverlay();
    const listener = vi.fn();
    policy.addChangeListener(listener);
    policy.enable(EditorOverlayId.CAD_BOUNDS_RULERS, 'object_tool');
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
    policy.enable(EditorOverlayId.CAD_BOUNDS_RULERS, 'second_owner');
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
    policy.release(EditorOverlayId.CAD_BOUNDS_RULERS, 'object_tool');
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
    policy.release(EditorOverlayId.CAD_BOUNDS_RULERS, 'second_owner');
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
