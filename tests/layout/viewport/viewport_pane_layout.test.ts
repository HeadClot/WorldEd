import { describe, expect, it } from 'vitest';
import { ViewportPaneLayout } from '@/layout/viewport/viewport_pane_layout.js';
import { DEFAULT_AREA_IDS } from '@/layout/area/area_layout_presets.js';

/**
 * Builds a pane layer with seed containers matching production area ids.
 *
 * @returns Layer and seed containers.
 */
function createViewportLayoutFixture(): { area: HTMLElement; viewports: HTMLElement[] } {
  const area = document.createElement('div');
  const ids = [DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.front, DEFAULT_AREA_IDS.side, DEFAULT_AREA_IDS.perspective];
  const viewports = ids.map((areaId) => {
    const viewport = document.createElement('div');
    viewport.dataset['areaId'] = areaId;
    area.appendChild(viewport);
    return viewport;
  });
  return { area, viewports };
}

/**
 * Returns data-area-id values for containers that are not display:none.
 *
 * @param viewports Seed containers.
 * @returns Visible area ids.
 */
function visibleAreaIds(viewports: HTMLElement[]): string[] {
  return viewports
    .filter((viewport) => viewport.style.display !== 'none')
    .map((viewport) => viewport.dataset['areaId'] ?? '');
}

describe('ViewportPaneLayout', () => {
  it('should show the expected areas for every pane count preset', () => {
    const fixture = createViewportLayoutFixture();
    const layout = new ViewportPaneLayout(fixture.area, fixture.viewports);
    const expectedVisible = [
      [DEFAULT_AREA_IDS.perspective],
      [DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.perspective],
      [DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.front, DEFAULT_AREA_IDS.perspective],
      [DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.front, DEFAULT_AREA_IDS.side, DEFAULT_AREA_IDS.perspective],
    ];

    expectedVisible.forEach((expectedIds, index) => {
      layout.apply((index + 1) as 1 | 2 | 3 | 4);
      expect(visibleAreaIds(fixture.viewports).sort()).toEqual([...expectedIds].sort());
      expect(layout.getVisibleSlots().length).toBe(expectedIds.length);
    });
  });

  it('should position panes with absolute geometry for the quad layout', () => {
    const fixture = createViewportLayoutFixture();
    const layout = new ViewportPaneLayout(fixture.area, fixture.viewports);
    layout.apply(4);
    for (const viewport of fixture.viewports) {
      expect(viewport.style.position).toBe('absolute');
      expect(viewport.style.display).not.toBe('none');
      expect(viewport.style.left.length).toBeGreaterThan(0);
      expect(viewport.style.width.length).toBeGreaterThan(0);
    }
  });

  it('should maximize any viewport and restore the configured pane layout', () => {
    const fixture = createViewportLayoutFixture();
    const layout = new ViewportPaneLayout(fixture.area, fixture.viewports);
    layout.apply(3);

    expect(layout.toggleMaximized(1)).toBe(1);
    expect(visibleAreaIds(fixture.viewports)).toEqual([DEFAULT_AREA_IDS.front]);

    expect(layout.toggleMaximized(1)).toBeNull();
    expect(visibleAreaIds(fixture.viewports).sort()).toEqual(
      [DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.front, DEFAULT_AREA_IDS.perspective].sort(),
    );
  });

  it('should switch directly between maximized viewports', () => {
    const fixture = createViewportLayoutFixture();
    const layout = new ViewportPaneLayout(fixture.area, fixture.viewports);
    layout.toggleMaximized(0);
    expect(layout.toggleMaximized(3)).toBe(3);
    expect(visibleAreaIds(fixture.viewports)).toEqual([DEFAULT_AREA_IDS.perspective]);
  });
});
