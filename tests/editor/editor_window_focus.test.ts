import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Vector2 } from 'three';
import { EditorWindow } from '@/editor/window/editor_window.js';
import { Tool } from '@/editor/tools/tool.js';
import { GuiWindow } from '@/editor/gui/gui_window.js';
import { EditorInputBridge } from '@/editor/window/editor_input_bridge.js';

/** Minimal tool fake for focus and SwitchTool / UseTool tests. */
class FakeTool extends Tool {
  readonly id: string;
  activated = 0;
  deactivated = 0;
  private busyFlag = false;
  keyDownCodes: string[] = [];

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

  /**
   * Sets the busy flag.
   *
   * @param value Busy state.
   */
  setBusy(value: boolean): void {
    this.busyFlag = value;
  }

  /** @inheritdoc */
  override isBusy(): boolean {
    return this.busyFlag;
  }

  /** @inheritdoc */
  override onKeyDown(keyCode: string): boolean {
    this.keyDownCodes.push(keyCode);
    return keyCode === 'KeyG';
  }
}

describe('EditorWindow focus system', () => {
  let editor: EditorWindow;
  let select: FakeTool;
  let move: FakeTool;
  let host: HTMLElement;
  let panelRoot: HTMLElement;
  let button: HTMLButtonElement;
  let viewportContent: HTMLElement;

  beforeEach(() => {
    editor = new EditorWindow();
    select = new FakeTool('select');
    move = new FakeTool('move');
    editor.switchTool(select);
    host = document.createElement('div');
    panelRoot = document.createElement('div');
    button = document.createElement('button');
    viewportContent = document.createElement('div');
    panelRoot.appendChild(button);
    host.appendChild(panelRoot);
    host.appendChild(viewportContent);
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('SwitchTool always switches even when the prior tool reports busy', () => {
    select.setBusy(true);
    editor.switchTool(move);
    expect(editor.activeTool).toBe(move);
    expect(move.activated).toBe(1);
  });

  it('UseTool sets parent and SwitchTool(parent) restores exactly once', () => {
    const grab = new FakeTool('grab');
    editor.useTool(grab);
    expect(grab.parent).toBe(select);
    expect(grab.isSingleUse).toBe(true);
    editor.switchTool(select);
    expect(editor.activeTool).toBe(select);
  });

  it('TrySwitchActiveEventReceiver fails when the current receiver is busy', () => {
    select.setBusy(true);
    expect(editor.trySwitchActiveEventReceiver(move)).toBe(false);
    expect(editor.getActiveEventReceiver()).toBe(select);
  });

  it('registers GUI windows and focuses them on mouse down when not busy', () => {
    const surface = new GuiWindow(panelRoot, 'tools_palette');
    editor.registerGuiWindow(surface);
    editor.lastEventTargetNode = button;
    editor.onMouseDown(0);
    expect(editor.getActiveEventReceiver()).toBe(surface);
    expect(editor.activeEventReceiverIsGuiContainer).toBe(true);
  });

  it('busy exclusive mounts a full-screen shield that covers chrome', () => {
    const bridge = new EditorInputBridge(editor);
    bridge.setExclusiveViewportRoot(viewportContent);
    select.setBusy(true);
    bridge.install(host);
    const shield = document.querySelector('[data-editor-exclusive-mouse-shield="true"]');
    expect(shield).toBeTruthy();
    expect(bridge.isExclusiveShieldMounted()).toBe(true);
    bridge.uninstall();
  });

  it('keeps exclusive shield mounted after busy ends until mouse button release', () => {
    const bridge = new EditorInputBridge(editor);
    viewportContent.getBoundingClientRect = () =>
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
    bridge.setExclusiveViewportRoot(viewportContent);
    select.setBusy(true);
    bridge.install(host);
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
    select.setBusy(false);
    bridge.setExclusiveViewportRoot(viewportContent);
    expect(editor.isLeftMousePressed).toBe(true);
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
    expect(editor.isLeftMousePressed).toBe(false);
    bridge.uninstall();
  });

  it('busy exclusive mounts shields on main and detached documents', () => {
    const bridge = new EditorInputBridge(editor);
    const detachedBody = document.createElement('div');
    const detachedDocument = {
      body: detachedBody,
      createElement: (tag: string) => {
        const element = document.createElement(tag);
        Object.defineProperty(element, 'ownerDocument', {
          value: detachedDocument,
          configurable: true,
        });
        return element;
      },
      elementFromPoint: () => null,
    } as unknown as Document;
    Object.defineProperty(detachedBody, 'ownerDocument', {
      value: detachedDocument,
      configurable: true,
    });
    const detachedViewport = detachedDocument.createElement('div');
    detachedBody.appendChild(detachedViewport);
    Object.defineProperty(detachedViewport, 'ownerDocument', {
      value: detachedDocument,
      configurable: true,
    });
    bridge.setExclusiveViewportRoots([viewportContent, detachedViewport]);
    select.setBusy(true);
    bridge.install(host);
    expect(bridge.getMountedExclusiveShieldCount()).toBe(2);
    expect(bridge.getMountedExclusiveShieldElement(document)).toBeTruthy();
    expect(bridge.getMountedExclusiveShieldElement(detachedDocument)).toBeTruthy();
    expect(document.body.contains(bridge.getMountedExclusiveShieldElement(document)!)).toBe(true);
    expect(detachedBody.contains(bridge.getMountedExclusiveShieldElement(detachedDocument)!)).toBe(true);
    bridge.uninstall();
    expect(bridge.getMountedExclusiveShieldCount()).toBe(0);
  });

  it('busy exclusive shield OnMouseDown only when the hit is in the pinned viewport', () => {
    const bridge = new EditorInputBridge(editor);
    viewportContent.getBoundingClientRect = () =>
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
    bridge.setExclusiveViewportRoot(viewportContent);
    select.setBusy(true);
    const mouseDown = vi.spyOn(select, 'onMouseDown');
    bridge.install(host);
    const shield = bridge.getMountedExclusiveShieldElement(document);
    expect(shield).toBeTruthy();
    shield!.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 20, clientY: 20, button: 0 }),
    );
    expect(mouseDown).toHaveBeenCalledWith(0);
    mouseDown.mockClear();
    shield!.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 9000,
        clientY: 9000,
        button: 0,
      }),
    );
    expect(mouseDown).not.toHaveBeenCalled();
    bridge.uninstall();
  });

  it('busy exclusive shield retargets RMB to the pinned viewport and blocks context menu', () => {
    const bridge = new EditorInputBridge(editor);
    viewportContent.getBoundingClientRect = () =>
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
    bridge.setExclusiveViewportRoot(viewportContent);
    select.setBusy(true);
    const mouseDown = vi.spyOn(select, 'onMouseDown');
    const viewportDown = vi.fn();
    viewportContent.addEventListener('pointerdown', viewportDown);
    bridge.install(host);
    const shield = bridge.getMountedExclusiveShieldElement(document);
    expect(shield).toBeTruthy();
    shield!.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: 20,
        clientY: 20,
        button: 2,
        buttons: 2,
      }),
    );
    expect(mouseDown).not.toHaveBeenCalled();
    expect(viewportDown).toHaveBeenCalledTimes(1);
    const context = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const prevented = vi.spyOn(context, 'preventDefault');
    shield!.dispatchEvent(context);
    expect(prevented).toHaveBeenCalled();
    bridge.uninstall();
  });

  it('OnKeyDown routes to the active tool before global fallthrough', () => {
    const global = vi.fn((_event?: KeyboardEvent) => false);
    editor.setServices({
      getTransformTargets: () => [],
      forEachSelectedObject: () => [],
      getSelectedCount: () => 0,
      getTransformPivot: () => ({ x: 0, y: 0, z: 0 }) as never,
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
      handleGlobalKeyDown: (_k, e) => global(e),
      isNavigationBlockingTools: () => false,
    });
    const event = new KeyboardEvent('keydown', { code: 'KeyG' });
    expect(editor.onKeyDown('KeyG', event)).toBe(true);
    expect(select.keyDownCodes).toContain('KeyG');
    expect(global).not.toHaveBeenCalled();
  });

  it('mouse move updates deltas for OnMouseMove', () => {
    editor.mousePosition.set(0, 0);
    editor.mouseGridPosition.set(0, 0);
    const moveSpy = vi.spyOn(select, 'onMouseMove');
    editor.updateMouseStateFromPointer(5, 7, viewportContent, -1, false);
    editor.onMouseMove(new Vector2(5, 7), new Vector2(5, 7));
    expect(moveSpy).toHaveBeenCalled();
  });
});
