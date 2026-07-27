import { describe, expect, it, beforeEach, vi } from 'vitest';
import { InputManager } from '../../../src/managers/input/input_manager.js';
import { ViewportRegistry } from '../../../src/managers/layout/viewport_registry.js';
import { ViewportKind } from '../../../src/viewports/viewport_kind.js';
import type { EditorViewport } from '../../../src/viewports/editor_viewport.js';

/** Creates a lightweight viewport mock for registry tests without WebGL. */
function createMockViewport(kind: ViewportKind): EditorViewport {
  let disposed = false;
  let assignedKind = kind;
  let name = kind;
  return {
    getViewportKind: () => assignedKind,
    setViewportKind: (next: ViewportKind) => {
      assignedKind = next;
    },
    setName: (next: string) => {
      name = next as ViewportKind;
    },
    getName: () => name,
    dispose: () => {
      disposed = true;
    },
    getIsDisposed: () => disposed,
  } as unknown as EditorViewport;
}

describe('ViewportRegistry', () => {
  let registry: ViewportRegistry;
  let inputManager: InputManager;
  let containers: HTMLElement[];

  beforeEach(() => {
    inputManager = { dispose: vi.fn() } as unknown as InputManager;
    containers = [0, 1, 2, 3].map(() => document.createElement('div'));
    registry = new ViewportRegistry((kind) => createMockViewport(kind));
  });

  it('should populate the default four-pane quad', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    expect(registry.getPanes()).toHaveLength(4);
    expect(registry.getAllViewports()).toHaveLength(4);
    expect(registry.getActiveViewports()).toHaveLength(4);
  });

  it('should create Top Front Side Perspective by default', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const kinds = registry.getAllViewports().map((viewport) => viewport.getViewportKind());
    expect(kinds).toEqual([ViewportKind.TOP, ViewportKind.FRONT, ViewportKind.SIDE, ViewportKind.PERSPECTIVE]);
  });

  it('should replace a pane kind by disposing and creating a new instance', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const pane = registry.getPanes()[0]!;
    const previous = pane.getViewport();
    expect(previous).toBeTruthy();
    const replaced = registry.replaceKind(pane.getId(), ViewportKind.PERSPECTIVE);
    expect(replaced).toBeTruthy();
    expect(previous!.getIsDisposed()).toBe(true);
    expect(pane.getKind()).toBe(ViewportKind.PERSPECTIVE);
    expect(pane.getViewport()).toBe(replaced);
    expect(replaced!.getViewportKind()).toBe(ViewportKind.PERSPECTIVE);
  });

  it('should filter active viewports when pane ids are restricted', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const onlyPerspective = registry.getPanes()[3]!.getId();
    registry.setActivePaneIds([onlyPerspective]);
    expect(registry.getActiveViewports()).toHaveLength(1);
    expect(registry.getActiveViewports()[0]!.getViewportKind()).toBe(ViewportKind.PERSPECTIVE);
    expect(registry.getAllViewports()).toHaveLength(4);
  });

  it('should clear a viewport instance without removing the pane', () => {
    registry.populateDefaultQuad(containers, { inputManager, sharedScene: {} as never, surface: {} as never });
    const pane = registry.getPanes()[1]!;
    const instance = pane.getViewport()!;
    registry.clearViewport(pane.getId());
    expect(pane.getViewport()).toBeNull();
    expect(instance.getIsDisposed()).toBe(true);
    expect(registry.getPanes()).toHaveLength(4);
  });
});
