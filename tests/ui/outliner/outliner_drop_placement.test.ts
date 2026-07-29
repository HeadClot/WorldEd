import { describe, expect, it } from 'vitest';
import {
  elevateOutlinerDropTarget,
  outlinerIndentDepthClaimMinX,
  outlinerRowDepthOffsetPx,
  pickOutlinerDropVisualTarget,
  remapAfterOnExpandedContainer,
  resolveOutlinerDropPlacement,
  resolveOutlinerDropTarget,
  resolveOutlinerIndentDepth,
  resolveOutlinerInsertLineGeometry,
  OUTLINER_BASE_PADDING_PX,
  OUTLINER_LEADING_CHROME_PX,
  OUTLINER_TREE_PADDING_PX,
} from '../../../src/ui/outliner/outliner_drop_placement.js';

describe('resolveOutlinerDropPlacement', () => {
  it('should place leaf rows as before in the top half', () => {
    expect(resolveOutlinerDropPlacement(9, 0, 20, false)).toBe('before');
  });

  it('should place leaf rows as after in the bottom half', () => {
    expect(resolveOutlinerDropPlacement(10, 0, 20, false)).toBe('after');
  });

  it('should place container rows as into in the middle band', () => {
    expect(resolveOutlinerDropPlacement(10, 0, 20, true)).toBe('into');
  });

  it('should place container rows as before in the top quarter', () => {
    expect(resolveOutlinerDropPlacement(2, 0, 20, true)).toBe('before');
  });

  it('should place container rows as after in the bottom quarter', () => {
    expect(resolveOutlinerDropPlacement(18, 0, 20, true)).toBe('after');
  });

  it('should default to before for invalid geometry', () => {
    expect(resolveOutlinerDropPlacement(Number.NaN, 0, 20, false)).toBe('before');
    expect(resolveOutlinerDropPlacement(10, 0, 0, false)).toBe('before');
  });
});

describe('resolveOutlinerIndentDepth', () => {
  it('should treat chevron and icon lead-in as a shallow drop zone', () => {
    const treeLeft = 100;
    const claimDepth1 = outlinerIndentDepthClaimMinX(1);
    // Over depth-1 padding + chevron/icon, still before the name column → depth 0.
    const overChromeX = treeLeft + claimDepth1 - 2;
    const overNameX = treeLeft + claimDepth1 + 2;
    expect(resolveOutlinerIndentDepth(overChromeX, treeLeft, 1)).toBe(0);
    expect(resolveOutlinerIndentDepth(overNameX, treeLeft, 1)).toBe(1);
  });

  it('should not require aiming at the far-left gutter for parent depth', () => {
    const treeLeft = 0;
    // Mid-row over a depth-1 item, left of name: still elevates to depth 0.
    const midChromeX = outlinerRowDepthOffsetPx(1) + OUTLINER_LEADING_CHROME_PX / 2;
    expect(midChromeX).toBeGreaterThan(OUTLINER_TREE_PADDING_PX + OUTLINER_BASE_PADDING_PX);
    expect(resolveOutlinerIndentDepth(midChromeX, treeLeft, 1)).toBe(0);
  });

  it('should clamp depth to the hovered row max', () => {
    const treeLeft = 0;
    const deepX = outlinerIndentDepthClaimMinX(8);
    expect(resolveOutlinerIndentDepth(deepX, treeLeft, 1)).toBe(1);
  });

  it('should stack claim thresholds per nested depth', () => {
    const treeLeft = 0;
    expect(resolveOutlinerIndentDepth(outlinerIndentDepthClaimMinX(2) - 1, treeLeft, 2)).toBe(1);
    expect(resolveOutlinerIndentDepth(outlinerIndentDepthClaimMinX(2), treeLeft, 2)).toBe(2);
  });
});

describe('resolveOutlinerInsertLineGeometry', () => {
  it('should span the full outliner width for root depth with no left margin', () => {
    const geometry = resolveOutlinerInsertLineGeometry(200, 0);
    expect(geometry.left).toBe(0);
    expect(geometry.width).toBe(200);
  });

  it('should ignore measured name left for root depth full-width lines', () => {
    const geometry = resolveOutlinerInsertLineGeometry(200, 0, 48);
    expect(geometry.left).toBe(0);
    expect(geometry.width).toBe(200);
  });

  it('should start at the measured name column for nested inserts', () => {
    const geometry = resolveOutlinerInsertLineGeometry(200, 1, 42);
    expect(geometry.left).toBe(42);
    expect(geometry.width).toBe(158);
  });

  it('should fall back to estimated name column when measurement is missing', () => {
    const root = resolveOutlinerInsertLineGeometry(200, 0);
    const child = resolveOutlinerInsertLineGeometry(200, 1);
    const grand = resolveOutlinerInsertLineGeometry(200, 2);
    expect(child.left).toBe(outlinerRowDepthOffsetPx(1) + OUTLINER_LEADING_CHROME_PX);
    expect(grand.left).toBe(outlinerRowDepthOffsetPx(2) + OUTLINER_LEADING_CHROME_PX);
    expect(child.width).toBeLessThan(root.width);
    expect(grand.width).toBeLessThan(child.width);
  });
});

describe('remapAfterOnExpandedContainer', () => {
  it('should turn after-on-expanded-parent into before first child', () => {
    const remapped = remapAfterOnExpandedContainer(
      'group',
      0,
      'after',
      (node) => node === 'group',
      (node) => (node === 'group' ? 'childA' : null),
    );
    expect(remapped).toEqual({ target: 'childA', depth: 1, placement: 'before' });
  });

  it('should keep after on collapsed parent as sibling after', () => {
    const remapped = remapAfterOnExpandedContainer(
      'group',
      0,
      'after',
      () => false,
      () => 'childA',
    );
    expect(remapped).toEqual({ target: 'group', depth: 0, placement: 'after' });
  });

  it('should keep before placement unchanged on expanded parent', () => {
    const remapped = remapAfterOnExpandedContainer(
      'group',
      0,
      'before',
      () => true,
      () => 'childA',
    );
    expect(remapped).toEqual({ target: 'group', depth: 0, placement: 'before' });
  });
});

describe('elevateOutlinerDropTarget', () => {
  /**
   * Builds a tiny linear parent map for elevation tests.
   *
   * @returns Parent lookup and first/last predicates for A→B→C.
   */
  function createChainFixture() {
    const parents = new Map<string, string | null>([
      ['solid', null],
      ['brushA', 'solid'],
      ['brushB', 'solid'],
    ]);
    const order = new Map<string, string[]>([['solid', ['brushA', 'brushB']]]);
    return {
      getParent: (node: string) => parents.get(node) ?? null,
      isFirst: (node: string) => {
        const parent = parents.get(node);
        if (!parent) return true;
        return order.get(parent)?.[0] === node;
      },
      isLast: (node: string) => {
        const parent = parents.get(node);
        if (!parent) return true;
        const siblings = order.get(parent) ?? [];
        return siblings[siblings.length - 1] === node;
      },
    };
  }

  it('should elevate after the last open child to the parent when indent is shallow', () => {
    const { getParent, isLast } = createChainFixture();
    const elevated = elevateOutlinerDropTarget('brushB', 1, 'after', 0, getParent, isLast);
    expect(elevated).toEqual({ target: 'solid', depth: 0 });
  });

  it('should not elevate after a middle child even when indent is shallow', () => {
    const { getParent, isLast } = createChainFixture();
    const elevated = elevateOutlinerDropTarget('brushA', 1, 'after', 0, getParent, isLast);
    expect(elevated).toEqual({ target: 'brushA', depth: 1 });
  });

  it('should not elevate before the first open child when indent is shallow', () => {
    const { getParent, isLast } = createChainFixture();
    const elevated = elevateOutlinerDropTarget('brushA', 1, 'before', 0, getParent, isLast);
    expect(elevated).toEqual({ target: 'brushA', depth: 1 });
  });

  it('should keep into placement on the hovered container without elevating', () => {
    const { getParent, isLast } = createChainFixture();
    const elevated = elevateOutlinerDropTarget('solid', 0, 'into', 0, getParent, isLast);
    expect(elevated).toEqual({ target: 'solid', depth: 0 });
  });

  it('should keep nested after placement when indent matches the child depth', () => {
    const { getParent, isLast } = createChainFixture();
    const elevated = elevateOutlinerDropTarget('brushB', 1, 'after', 1, getParent, isLast);
    expect(elevated).toEqual({ target: 'brushB', depth: 1 });
  });
});

describe('resolveOutlinerDropTarget', () => {
  it('should resolve after an expanded solid via last brush and shallow X over chrome', () => {
    const parents = new Map<string, string | null>([
      ['solid', null],
      ['brush', 'solid'],
    ]);
    // Over depth-1 chevron/icon, not the far gutter.
    const shallowOverChromeX = outlinerIndentDepthClaimMinX(1) - 4;
    const resolved = resolveOutlinerDropTarget(
      'brush',
      1,
      shallowOverChromeX,
      15,
      0,
      20,
      0,
      false,
      (node) => parents.get(node) ?? null,
      () => true,
    );
    expect(resolved.target).toBe('solid');
    expect(resolved.placement).toBe('after');
    expect(resolved.visualTarget).toBe('brush');
    expect(resolved.insertDepth).toBe(0);
  });

  it('should not promote before-first-child with shallow X to a root full-width drop', () => {
    const parents = new Map<string, string | null>([
      ['group', null],
      ['childA', 'group'],
      ['childB', 'group'],
    ]);
    const shallowX = outlinerIndentDepthClaimMinX(1) - 4;
    // Top half of first child (before) + shallow X must stay nested under group.
    const resolved = resolveOutlinerDropTarget(
      'childA',
      1,
      shallowX,
      5,
      0,
      20,
      0,
      false,
      (node) => parents.get(node) ?? null,
      (node) => node === 'childB',
    );
    expect(resolved.target).toBe('childA');
    expect(resolved.placement).toBe('before');
    expect(resolved.insertDepth).toBe(1);
  });

  it('should remap bottom of expanded parent to before first child not full-width after', () => {
    const parents = new Map<string, string | null>([
      ['group', null],
      ['childA', 'group'],
    ]);
    // Bottom quarter of expanded group row (after band) at root depth.
    const resolved = resolveOutlinerDropTarget(
      'group',
      0,
      8,
      18,
      0,
      20,
      0,
      true,
      (node) => parents.get(node) ?? null,
      () => false,
      (node) => node === 'group',
      (node) => (node === 'group' ? 'childA' : null),
    );
    expect(resolved.target).toBe('childA');
    expect(resolved.placement).toBe('before');
    expect(resolved.insertDepth).toBe(1);
  });

  it('should keep into on a container middle band so nesting remains available', () => {
    const resolved = resolveOutlinerDropTarget(
      'solid',
      0,
      outlinerIndentDepthClaimMinX(1) + 8,
      10,
      0,
      20,
      0,
      true,
      () => null,
      () => true,
    );
    expect(resolved.target).toBe('solid');
    expect(resolved.placement).toBe('into');
    expect(resolved.insertDepth).toBe(0);
    expect(pickOutlinerDropVisualTarget(resolved.target, 'solid', 'into')).toBe('solid');
  });
});
