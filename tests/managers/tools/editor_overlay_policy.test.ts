import { describe, it, expect, vi } from 'vitest';
import { EditorOverlayPolicy } from '../../../src/managers/tools/editor_overlay_policy.js';
import { EditorOverlayId } from '../../../src/managers/tools/editor_overlay_id.js';

describe('EditorOverlayPolicy', () => {
  it('should allow overlays by default', () => {
    const policy = new EditorOverlayPolicy();
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
  });

  it('should suppress and release by reason without conflict across tools', () => {
    const policy = new EditorOverlayPolicy();
    const listener = vi.fn();
    policy.addChangeListener(listener);
    policy.suppress(EditorOverlayId.CAD_BOUNDS_RULERS, 'clip_plane');
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    policy.suppress(EditorOverlayId.CAD_BOUNDS_RULERS, 'future_tool');
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    policy.release(EditorOverlayId.CAD_BOUNDS_RULERS, 'clip_plane');
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    policy.release(EditorOverlayId.CAD_BOUNDS_RULERS, 'future_tool');
    expect(policy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});
