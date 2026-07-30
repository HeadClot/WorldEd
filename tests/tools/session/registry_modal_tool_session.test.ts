import { describe, it, expect, vi } from 'vitest';
import { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';

describe('ModalToolSessionRegistry', () => {
  it('should end selection-sensitive sessions on selection change', () => {
    const registry = new RegistryModalToolSession();
    const end = vi.fn();
    registry.register({
      id: 'clip_plane',
      endsOnSelectionChange: true,
      end,
    });
    registry.onSelectionChanged();
    expect(end).toHaveBeenCalledTimes(1);
    expect(registry.has('clip_plane')).toBe(false);
  });

  it('should ignore selection changes while suppressed', () => {
    const registry = new RegistryModalToolSession();
    const end = vi.fn();
    registry.register({
      id: 'clip_plane',
      endsOnSelectionChange: true,
      end,
    });
    registry.runWithSelectionEndSuppressed(() => {
      registry.onSelectionChanged();
    });
    expect(end).not.toHaveBeenCalled();
    expect(registry.has('clip_plane')).toBe(true);
  });

  it('should not end sessions that opt out of selection cancellation', () => {
    const registry = new RegistryModalToolSession();
    const end = vi.fn();
    registry.register({
      id: 'sticky_tool',
      endsOnSelectionChange: false,
      end,
    });
    registry.onSelectionChanged();
    expect(end).not.toHaveBeenCalled();
    expect(registry.has('sticky_tool')).toBe(true);
  });
});
