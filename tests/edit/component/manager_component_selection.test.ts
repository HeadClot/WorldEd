import { describe, it, expect } from 'vitest';
import { ManagerComponentSelection } from '@/edit/component/manager_component_selection.js';

describe('ManagerComponentSelection', () => {
  it('replaces, adds, and toggles entries', () => {
    const manager = new ManagerComponentSelection();
    manager.select({ targetId: 'a', kind: 'vertex', componentKey: '0' }, false);
    manager.select({ targetId: 'a', kind: 'vertex', componentKey: '1' }, true);
    expect(manager.getSelectedCount()).toBe(2);
    manager.toggle({ targetId: 'a', kind: 'vertex', componentKey: '0' });
    expect(manager.getSelectedCount()).toBe(1);
    manager.clear();
    expect(manager.getSelectedCount()).toBe(0);
  });

  it('replaceAll replaces the selection set in one notify', () => {
    const manager = new ManagerComponentSelection();
    let notifyCount = 0;
    manager.setChangeCallback(() => {
      notifyCount += 1;
    });
    manager.select({ targetId: 'a', kind: 'face', componentKey: '0' }, false);
    manager.replaceAll([
      { targetId: 'a', kind: 'edge', componentKey: '0:1' },
      { targetId: 'a', kind: 'edge', componentKey: '1:2' },
      { targetId: 'a', kind: 'edge', componentKey: '0:1' },
    ]);
    expect(manager.getSelectedCount()).toBe(2);
    expect(manager.getSelected().every((entry) => entry.kind === 'edge')).toBe(true);
    expect(notifyCount).toBe(2);
  });
});
