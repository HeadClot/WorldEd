import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEWPORT_QUAD_KINDS,
  VIEWPORT_KIND_MENU_ORDER,
  ViewportKind,
  getViewportKindDisplayLabel,
  getViewportKindMetadata,
  isPerspectiveViewportKind,
  parseViewportKind,
} from '../../src/viewports/viewport_kind.js';

describe('ViewportKind', () => {
  it('should expose four kinds with stable string values', () => {
    expect(ViewportKind.TOP).toBe('top');
    expect(ViewportKind.FRONT).toBe('front');
    expect(ViewportKind.SIDE).toBe('side');
    expect(ViewportKind.PERSPECTIVE).toBe('perspective');
  });

  it('should provide display labels for menus and toolbars', () => {
    expect(getViewportKindDisplayLabel(ViewportKind.TOP)).toBe('Top');
    expect(getViewportKindDisplayLabel(ViewportKind.PERSPECTIVE)).toBe('Perspective');
  });

  it('should map orthographic kinds to grid planes', () => {
    expect(getViewportKindMetadata(ViewportKind.TOP).gridPlane).toBe('xz');
    expect(getViewportKindMetadata(ViewportKind.FRONT).gridPlane).toBe('xy');
    expect(getViewportKindMetadata(ViewportKind.SIDE).gridPlane).toBe('yz');
  });

  it('should mark only perspective as preferring the world host', () => {
    expect(getViewportKindMetadata(ViewportKind.PERSPECTIVE).prefersWorldHost).toBe(true);
    expect(getViewportKindMetadata(ViewportKind.TOP).prefersWorldHost).toBe(false);
    expect(isPerspectiveViewportKind(ViewportKind.PERSPECTIVE)).toBe(true);
    expect(isPerspectiveViewportKind(ViewportKind.FRONT)).toBe(false);
  });

  it('should order menu kinds for the type dropdown', () => {
    expect(VIEWPORT_KIND_MENU_ORDER).toEqual([
      ViewportKind.TOP,
      ViewportKind.FRONT,
      ViewportKind.SIDE,
      ViewportKind.PERSPECTIVE,
    ]);
  });

  it('should define the default quad layout kinds', () => {
    expect(DEFAULT_VIEWPORT_QUAD_KINDS).toHaveLength(4);
    expect(DEFAULT_VIEWPORT_QUAD_KINDS[3]).toBe(ViewportKind.PERSPECTIVE);
  });

  it('should parse valid kind strings and reject unknown values', () => {
    expect(parseViewportKind('side')).toBe(ViewportKind.SIDE);
    expect(parseViewportKind('nope')).toBeNull();
  });
});
