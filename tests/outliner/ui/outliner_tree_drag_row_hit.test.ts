import { describe, expect, it } from 'vitest';
import {
  OUTLINER_ROW_ELEMENT_CLASS,
  outlinerRowElementFromElementStackResolve,
  outlinerRowElementFromNodeResolve,
  outlinerRowElementFromPointerResolve,
} from '@/outliner/ui/outliner_tree_drag_row_hit.js';

describe('outlinerRowElementFromPointerResolve', () => {
  it('should return the row under the pointer from an elementsFromPoint stack', () => {
    const row = document.createElement('div');
    row.classList.add(OUTLINER_ROW_ELEMENT_CLASS);
    const child = document.createElement('span');
    row.appendChild(child);
    const ghost = document.createElement('div');
    const found = outlinerRowElementFromPointerResolve(10, 20, () => [ghost, child, row]);
    expect(found).toBe(row);
  });

  it('should return null when the stack has no outliner row', () => {
    const chrome = document.createElement('div');
    expect(outlinerRowElementFromPointerResolve(0, 0, () => [chrome])).toBeNull();
  });
});

describe('outlinerRowElementFromElementStackResolve', () => {
  it('should skip drag-ghost layers above the real row', () => {
    const row = document.createElement('div');
    row.classList.add(OUTLINER_ROW_ELEMENT_CLASS);
    const dragImage = document.createElement('div');
    expect(outlinerRowElementFromElementStackResolve([dragImage, row])).toBe(row);
  });
});

describe('outlinerRowElementFromNodeResolve', () => {
  it('should resolve a nested child node to its row ancestor', () => {
    const row = document.createElement('div');
    row.classList.add(OUTLINER_ROW_ELEMENT_CLASS);
    const icon = document.createElement('span');
    row.appendChild(icon);
    expect(outlinerRowElementFromNodeResolve(icon)).toBe(row);
  });

  it('should return null for nodes outside any row', () => {
    expect(outlinerRowElementFromNodeResolve(document.createElement('div'))).toBeNull();
  });
});
