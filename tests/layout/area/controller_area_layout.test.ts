import { describe, expect, it } from 'vitest';
import { ControllerAreaLayout } from '@/layout/area/controller_area_layout.js';
import { DEFAULT_AREA_IDS } from '@/layout/area/area_layout_presets.js';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';

/**
 * Builds a pane layer with seed containers for the default quad.
 *
 * @returns Pane layer element.
 */
function createSeedLayer(): HTMLElement {
  const layer = document.createElement('div');
  for (const areaId of Object.values(DEFAULT_AREA_IDS)) {
    const child = document.createElement('div');
    child.dataset['areaId'] = areaId;
    layer.appendChild(child);
  }
  return layer;
}

describe('AreaLayoutController', () => {
  it('should split an area and create a new container', () => {
    const layer = createSeedLayer();
    const controller = new ControllerAreaLayout(layer);
    controller.apply();
    const before = controller.getLeafCount();
    const created = controller.splitArea(DEFAULT_AREA_IDS.top, 'horizontal', 0.5, ViewportKind.TOP);
    expect(created).not.toBeNull();
    expect(controller.getLeafCount()).toBe(before + 1);
    expect(controller.getLayoutDom().getContainer(created!.areaId)).toBeTruthy();
  });

  it('should refuse join when only one leaf remains', () => {
    const layer = createSeedLayer();
    const controller = new ControllerAreaLayout(layer);
    controller.applyPaneCountPreset(1);
    expect(controller.joinAreas(DEFAULT_AREA_IDS.perspective, DEFAULT_AREA_IDS.top)).toBe(false);
  });

  it('should join neighbors and prune the removed container', () => {
    const layer = createSeedLayer();
    const controller = new ControllerAreaLayout(layer);
    controller.apply();
    expect(controller.joinAreas(DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.front)).toBe(true);
    expect(controller.getLeafCount()).toBe(3);
    expect(controller.getLayoutDom().getContainer(DEFAULT_AREA_IDS.front)).toBeNull();
  });

  it('should maximize and restore', () => {
    const layer = createSeedLayer();
    const controller = new ControllerAreaLayout(layer);
    controller.apply();
    expect(controller.toggleMaximized(DEFAULT_AREA_IDS.side)).toBe(DEFAULT_AREA_IDS.side);
    expect(controller.getPlacements()).toHaveLength(1);
    expect(controller.toggleMaximized(DEFAULT_AREA_IDS.side)).toBeNull();
    expect(controller.getPlacements()).toHaveLength(4);
  });
});
