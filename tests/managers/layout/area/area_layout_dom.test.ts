import { describe, expect, it } from 'vitest';
import { AreaLayoutDom } from '../../../../src/managers/layout/area/area_layout_dom.js';
import { createViewportLeafPayload } from '../../../../src/managers/layout/area/area_editor_type.js';
import { createLeafPlacement } from '../../../../src/managers/layout/area/area_leaf_placement.js';
import { ViewportKind } from '../../../../src/viewports/viewport_kind.js';

/**
 * Stubs clientWidth/clientHeight on a layer for integer pixel layout tests.
 *
 * @param layer Layer element.
 * @param width CSS width.
 * @param height CSS height.
 */
function stubLayerSize(layer: HTMLElement, width: number, height: number): void {
  Object.defineProperty(layer, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(layer, 'clientHeight', { configurable: true, get: () => height });
}

describe('AreaLayoutDom', () => {
  it('should adopt seed children and position them with integer pixels', () => {
    const layer = document.createElement('div');
    stubLayerSize(layer, 1000, 500);
    const seed = document.createElement('div');
    seed.dataset['areaId'] = 'pane_a';
    layer.appendChild(seed);
    const dom = new AreaLayoutDom(layer, { gapPx: 0 });
    const placements = [
      createLeafPlacement(createViewportLeafPayload('pane_a', ViewportKind.TOP), {
        x: 0,
        y: 0,
        width: 0.5,
        height: 1,
      }),
      createLeafPlacement(createViewportLeafPayload('pane_b', ViewportKind.FRONT), {
        x: 0.5,
        y: 0,
        width: 0.5,
        height: 1,
      }),
    ];
    const containers = dom.applyPlacements(placements);
    expect(containers).toHaveLength(2);
    expect(dom.getContainer('pane_a')).toBe(seed);
    expect(seed.style.left).toBe('0px');
    expect(seed.style.width).toBe('500px');
    expect(dom.getContainer('pane_b')!.style.left).toBe('500px');
  });

  it('should hide missing containers without pruning when pruneMissing is false', () => {
    const layer = document.createElement('div');
    stubLayerSize(layer, 800, 400);
    const dom = new AreaLayoutDom(layer, { gapPx: 0 });
    const two = [
      createLeafPlacement(createViewportLeafPayload('a', ViewportKind.TOP), {
        x: 0,
        y: 0,
        width: 0.5,
        height: 1,
      }),
      createLeafPlacement(createViewportLeafPayload('b', ViewportKind.FRONT), {
        x: 0.5,
        y: 0,
        width: 0.5,
        height: 1,
      }),
    ];
    dom.applyPlacements(two);
    dom.applyPlacements([two[0]!]);
    expect(dom.getContainer('b')!.style.display).toBe('none');
    expect(dom.getContainer('b')!.parentElement).toBe(layer);
  });

  it('should prune missing containers when requested', () => {
    const layer = document.createElement('div');
    stubLayerSize(layer, 800, 400);
    const dom = new AreaLayoutDom(layer, { gapPx: 0 });
    const two = [
      createLeafPlacement(createViewportLeafPayload('a', ViewportKind.TOP), {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }),
      createLeafPlacement(createViewportLeafPayload('b', ViewportKind.FRONT), {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }),
    ];
    dom.applyPlacements(two);
    dom.applyPlacements([two[0]!], { pruneMissing: true });
    expect(dom.getContainer('b')).toBeNull();
  });
});
