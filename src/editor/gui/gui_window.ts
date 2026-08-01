import { Vector2 } from 'three';
import type { EditorWindow } from '../window/editor_window.js';
import type { IGuiContainerEventReceiver } from './gui_container_event_receiver.js';

/** Floating tool window as an editor event receiver (Shape Editor GuiWindow). */
export class GuiWindow implements IGuiContainerEventReceiver {
  /** The editor window. */
  editor: EditorWindow | null;
  private readonly rootElement: HTMLElement;
  private readonly surfaceId: string;

  /**
   * Creates a GUI surface bound to a floating panel root.
   *
   * @param rootElement Panel root element used for contains hit-tests.
   * @param surfaceId Stable id for diagnostics and tests.
   */
  constructor(rootElement: HTMLElement, surfaceId: string) {
    this.editor = null;
    this.rootElement = rootElement;
    this.surfaceId = surfaceId;
  }

  /**
   * Returns the stable surface id.
   *
   * @returns Surface id string.
   */
  getSurfaceId(): string {
    return this.surfaceId;
  }

  /**
   * Returns the panel root element.
   *
   * @returns Root HTML element.
   */
  getRootElement(): HTMLElement {
    return this.rootElement;
  }

  /**
   * Returns whether a DOM node lies inside this surface.
   *
   * @param node Event target node, or null.
   * @returns True when the node is this root or a descendant.
   */
  containsNode(node: Node | null): boolean {
    if (!node) {
      return false;
    }
    return this.rootElement === node || this.rootElement.contains(node);
  }

  /**
   * Returns whether the pointer is over this container.
   *
   * @returns True when the last mouse event target is inside this root.
   */
  get isMouseOver(): boolean {
    if (!this.editor) {
      return false;
    }
    return this.containsNode(this.editor.lastEventTargetNode);
  }

  /**
   * GUI surfaces are not exclusive-busy.
   *
   * @returns Always false.
   */
  isBusy(): boolean {
    return false;
  }

  /** @inheritdoc */
  onActivate(): void {}

  /** @inheritdoc */
  onDeactivate(): void {}

  /** @inheritdoc */
  onRender(): void {}

  /** @inheritdoc */
  onMouseDown(_button: number): void {}

  /** @inheritdoc */
  onMouseUp(_button: number): void {}

  /** @inheritdoc */
  onGlobalMouseUp(_button: number): void {}

  /** @inheritdoc */
  onMouseDrag(_button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {}

  /** @inheritdoc */
  onGlobalMouseDrag(_button: number, _screenDelta: Vector2, _gridDelta: Vector2): void {}

  /** @inheritdoc */
  onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {}

  /**
   * Floating panels do not consume scroll.
   *
   * @param _delta Scroll delta.
   * @returns Always false.
   */
  onMouseScroll(_delta: number): boolean {
    return false;
  }

  /**
   * Floating panels do not consume keys; fallthrough focuses the active tool.
   *
   * @param _keyCode Key code string.
   * @returns Always false.
   */
  onKeyDown(_keyCode: string, _event?: KeyboardEvent): boolean {
    return false;
  }

  /**
   * Floating panels do not consume key-up events.
   *
   * @param _keyCode Key code string.
   * @returns Always false.
   */
  onKeyUp(_keyCode: string): boolean {
    return false;
  }

  /** @inheritdoc */
  onFocus(): void {}

  /** @inheritdoc */
  onFocusLost(): void {}
}
