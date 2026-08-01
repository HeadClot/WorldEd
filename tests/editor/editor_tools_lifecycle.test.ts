import { describe, it, expect, vi } from 'vitest';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { EditorInputBridge } from '@/editor/window/editor_input_bridge.js';
import { Tool } from '@/editor/tools/tool.js';
import { BoxSelectTool } from '@/editor/tools/box_select_tool.js';
import { TranslateTool } from '@/editor/tools/translate_tool.js';
import type { EditorServices } from '@/editor/window/editor_services.js';
import * as THREE from 'three';

/** Minimal tool fake for parent restore tests. */
class FakeTool extends Tool {
  readonly id: string;
  activated = 0;
  deactivated = 0;

  /**
   * Creates a fake tool.
   *
   * @param id Stable id.
   */
  constructor(id: string) {
    super();
    this.id = id;
  }

  /** @inheritdoc */
  override onActivate(): void {
    this.activated += 1;
  }

  /** @inheritdoc */
  override onDeactivate(): void {
    this.deactivated += 1;
  }
}

/**
 * Builds stub services for single-use lifecycle tests.
 *
 * @param overrides Partial service overrides.
 * @returns Services implementation.
 */
function createStubServices(overrides: Partial<EditorServices> = {}): EditorServices {
  return {
    getTransformTargets: () => [],
    forEachSelectedObject: () => [],
    getSelectedCount: () => 0,
    getTransformPivot: () => new THREE.Vector3(),
    getSelectedSegmentsAveragePosition: () => ({ x: 0, y: 0 }),
    isSnapping: () => false,
    getGridSnap: () => 1,
    getAngleSnap: () => 15,
    screenPointToGrid: (x, y) => ({ x, y }),
    gridPointToScreen: (x, y) => ({ x, y }),
    getActiveCamera: () => null,
    getActivePickElement: () => null,
    resolveInteractiveViewportAtClientPoint: () => null,
    resolveFirstInteractiveViewportInDocument: () => null,
    getInteractiveViewportPickElements: () => [],
    beginSingleUseDrag: () => false,
    applySingleUsePointerMove: () => {},
    isTransformDragActive: () => false,
    isPermanentGizmoHandleDragActive: () => false,
    handleModalKeyDown: () => false,
    commitActiveTransformDrag: () => {},
    cancelActiveTransformDrag: () => {},
    pinExclusiveViewportDomain: () => {},
    pinExclusiveViewport: () => {},
    clearExclusiveViewport: () => {},
    setWidgetMode: () => {},
    refreshGizmoPresentation: () => {},
    setStatusMessage: () => {},
    registerUndo: () => {},
    discardUndo: () => {},
    publishTransformDragVisualEnd: () => {},
    getLastPointerClientPosition: () => null,
    isShiftPressed: () => false,
    isCtrlPressed: () => false,
    isModifierPressed: () => false,
    handleGlobalKeyDown: () => false,
    isNavigationBlockingTools: () => false,
    ...overrides,
  };
}

describe('Editor tools lifecycle', () => {
  it('validateTools installs box select as the default tool', () => {
    const editor = new EditorWindow();
    editor.setServices(createStubServices());
    editor.validateTools();
    expect(editor.activeTool).toBeInstanceOf(BoxSelectTool);
  });

  it('UseTool sets parent and restore via SwitchTool(parent)', () => {
    const editor = new EditorWindow();
    editor.setServices(createStubServices());
    const select = new FakeTool('select');
    const grab = new FakeTool('grab');
    editor.switchTool(select);
    editor.useTool(grab);
    expect(grab.parent).toBe(select);
    expect(grab.isSingleUse).toBe(true);
    editor.switchTool(select);
    expect(editor.activeTool).toBe(select);
    expect(grab.deactivated).toBe(1);
  });

  it('BoxSelectTool G launches single-use TranslateTool when selection exists', () => {
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        getSelectedCount: () => 1,
        getTransformTargets: () => [new THREE.Object3D()],
        beginSingleUseDrag: () => true,
        getActiveCamera: () => new THREE.PerspectiveCamera(),
        getActivePickElement: () => document.createElement('div'),
      }),
    );
    editor.validateTools();
    const handled = editor.getActiveEventReceiver().onKeyDown('KeyG');
    expect(handled).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(TranslateTool);
    expect(editor.activeTool?.isSingleUse).toBe(true);
    expect(editor.isToolBusy).toBe(true);
  });

  it('single-use TranslateTool X Y Z route to modal axis lock (Shape Editor / Blender)', () => {
    const handleModalKeyDown = vi.fn(() => true);
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        getSelectedCount: () => 1,
        getTransformTargets: () => [new THREE.Object3D()],
        beginSingleUseDrag: () => true,
        getActiveCamera: () => new THREE.PerspectiveCamera(),
        getActivePickElement: () => document.createElement('div'),
        isTransformDragActive: () => true,
        handleModalKeyDown,
      }),
    );
    editor.validateTools();
    editor.getActiveEventReceiver().onKeyDown('KeyG');
    expect(editor.activeTool).toBeInstanceOf(TranslateTool);
    expect(editor.getActiveEventReceiver().onKeyDown('KeyX')).toBe(true);
    expect(editor.getActiveEventReceiver().onKeyDown('KeyY')).toBe(true);
    expect(editor.getActiveEventReceiver().onKeyDown('KeyZ')).toBe(true);
    expect(handleModalKeyDown).toHaveBeenCalledWith('KeyX', expect.any(KeyboardEvent));
    expect(handleModalKeyDown).toHaveBeenCalledWith('KeyY', expect.any(KeyboardEvent));
    expect(handleModalKeyDown).toHaveBeenCalledWith('KeyZ', expect.any(KeyboardEvent));
  });

  it('BoxSelectTool G refuses empty selection', () => {
    const editor = new EditorWindow();
    editor.setServices(createStubServices({ getSelectedCount: () => 0 }));
    editor.validateTools();
    const box = editor.getBoxSelectTool();
    expect(box.onKeyDown('KeyG')).toBe(false);
    expect(editor.activeTool).toBe(box);
  });

  it('single-use TranslateTool Escape cancels and restores parent', () => {
    const cancel = vi.fn();
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        getSelectedCount: () => 1,
        getTransformTargets: () => [new THREE.Object3D()],
        beginSingleUseDrag: () => true,
        getActiveCamera: () => new THREE.PerspectiveCamera(),
        getActivePickElement: () => document.createElement('div'),
        cancelActiveTransformDrag: cancel,
        isTransformDragActive: () => true,
      }),
    );
    editor.validateTools();
    const parent = editor.activeTool;
    editor.useSingleUseTranslateTool();
    expect(editor.activeTool).toBeInstanceOf(TranslateTool);
    editor.getActiveEventReceiver().onKeyDown('Escape');
    expect(cancel).toHaveBeenCalled();
    expect(editor.activeTool).toBe(parent);
    expect(editor.getActiveEventReceiver()).toBe(parent);
    expect(editor.isToolBusy).toBe(false);
  });

  it('G then Escape then G launches single-use translate again', () => {
    let dragActive = false;
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        getSelectedCount: () => 1,
        getTransformTargets: () => [new THREE.Object3D()],
        beginSingleUseDrag: () => {
          dragActive = true;
          return true;
        },
        getActiveCamera: () => new THREE.PerspectiveCamera(),
        getActivePickElement: () => document.createElement('div'),
        cancelActiveTransformDrag: () => {
          dragActive = false;
        },
        isTransformDragActive: () => dragActive,
      }),
    );
    editor.validateTools();
    const parent = editor.activeTool;
    expect(editor.getActiveEventReceiver().onKeyDown('KeyG')).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(TranslateTool);
    expect(editor.isToolBusy).toBe(true);
    editor.getActiveEventReceiver().onKeyDown('Escape');
    expect(editor.activeTool).toBe(parent);
    expect(editor.getActiveEventReceiver()).toBe(parent);
    expect(editor.isToolBusy).toBe(false);
    expect(editor.getActiveEventReceiver().onKeyDown('KeyG')).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(TranslateTool);
    expect(editor.activeTool?.isSingleUse).toBe(true);
    expect(editor.isToolBusy).toBe(true);
  });

  it('OnMouseDown then OnGlobalMouseUp ends single-use and restores focus for another G', () => {
    let dragActive = false;
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        getSelectedCount: () => 1,
        getTransformTargets: () => [new THREE.Object3D()],
        beginSingleUseDrag: () => {
          dragActive = true;
          return true;
        },
        getActiveCamera: () => new THREE.PerspectiveCamera(),
        getActivePickElement: () => document.createElement('div'),
        commitActiveTransformDrag: () => {
          dragActive = false;
        },
        cancelActiveTransformDrag: () => {
          dragActive = false;
        },
        isTransformDragActive: () => dragActive,
      }),
    );
    editor.validateTools();
    const parent = editor.activeTool;
    editor.getActiveEventReceiver().onKeyDown('KeyG');
    expect(editor.isToolBusy).toBe(true);
    editor.onMouseDown(0);
    expect(editor.isToolBusy).toBe(false);
    editor.onGlobalMouseUp(0);
    expect(editor.activeTool).toBe(parent);
    expect(editor.getActiveEventReceiver()).toBe(parent);
    expect(editor.isToolBusy).toBe(false);
    expect(editor.getActiveEventReceiver().onKeyDown('KeyG')).toBe(true);
    expect(editor.activeTool).toBeInstanceOf(TranslateTool);
    expect(editor.isToolBusy).toBe(true);
  });

  it('bridge LMB confirm keeps shield until up so parent is restored (detached path)', () => {
    let dragActive = false;
    const editor = new EditorWindow();
    const host = document.createElement('div');
    const viewport = document.createElement('div');
    host.appendChild(viewport);
    document.body.appendChild(host);
    viewport.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    const bridge = new EditorInputBridge(editor);
    editor.setServices(
      createStubServices({
        getSelectedCount: () => 1,
        getTransformTargets: () => [new THREE.Object3D()],
        beginSingleUseDrag: () => {
          dragActive = true;
          return true;
        },
        getActiveCamera: () => new THREE.PerspectiveCamera(),
        getActivePickElement: () => viewport,
        commitActiveTransformDrag: () => {
          dragActive = false;
        },
        isTransformDragActive: () => dragActive,
        pinExclusiveViewport: () => {
          bridge.setExclusiveViewportRoots([viewport]);
        },
        clearExclusiveViewport: () => {
          bridge.setExclusiveViewportRoots(null);
        },
        getInteractiveViewportPickElements: () => [viewport],
        resolveFirstInteractiveViewportInDocument: () => ({
          camera: new THREE.PerspectiveCamera(),
          pickElement: viewport,
        }),
        resolveInteractiveViewportAtClientPoint: () => ({
          camera: new THREE.PerspectiveCamera(),
          pickElement: viewport,
        }),
      }),
    );
    editor.validateTools();
    const parent = editor.activeTool;
    bridge.install(host);
    editor.getActiveEventReceiver().onKeyDown('KeyG');
    expect(editor.isToolBusy).toBe(true);
    expect(bridge.isExclusiveShieldMounted()).toBe(true);
    const shield = bridge.getMountedExclusiveShieldElement(document);
    expect(shield).toBeTruthy();
    shield!.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        button: 0,
        buttons: 1,
      }),
    );
    expect(editor.isToolBusy).toBe(false);
    expect(bridge.isExclusiveShieldMounted()).toBe(true);
    const shieldAfterDown = bridge.getMountedExclusiveShieldElement(document);
    expect(shieldAfterDown).toBeTruthy();
    shieldAfterDown!.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        button: 0,
        buttons: 0,
      }),
    );
    expect(editor.activeTool).toBe(parent);
    expect(editor.getActiveEventReceiver()).toBe(parent);
    expect(editor.isToolBusy).toBe(false);
    expect(bridge.isExclusiveShieldMounted()).toBe(false);
    bridge.uninstall();
    host.remove();
  });

  it('OnGlobalMouseUp without prior OnMouseDown must not leave focus stuck busy', () => {
    const editor = new EditorWindow();
    editor.setServices(
      createStubServices({
        getSelectedCount: () => 1,
        getTransformTargets: () => [new THREE.Object3D()],
        beginSingleUseDrag: () => true,
        getActiveCamera: () => new THREE.PerspectiveCamera(),
        getActivePickElement: () => document.createElement('div'),
        isTransformDragActive: () => true,
      }),
    );
    editor.validateTools();
    const parent = editor.activeTool;
    editor.getActiveEventReceiver().onKeyDown('KeyG');
    expect(editor.isToolBusy).toBe(true);
    editor.onGlobalMouseUp(0);
    expect(editor.activeTool).toBe(parent);
    expect(editor.getActiveEventReceiver()).toBe(parent);
    expect(editor.isToolBusy).toBe(false);
  });

  it('SwitchTool clears widgets from the previous tool', () => {
    const editor = new EditorWindow();
    editor.setServices(createStubServices({ getSelectedCount: () => 1 }));
    editor.validateTools();
    editor.userSwitchToTranslateTool();
    expect(editor.getWidgets().length).toBeGreaterThan(0);
    editor.userSwitchToBoxSelectTool();
    expect(editor.getWidgets().length).toBe(0);
  });
});
