import type { IEditorEventReceiver } from '../i_editor_event_receiver.js';

/**
 * Marker for floating GUI containers that can receive editor focus (Shape
 * Editor IGuiContainerEventReceiver). Used by OnMouseDown window hit-testing
 * and OnKeyDown fallthrough to the active tool.
 */
export interface IGuiContainerEventReceiver extends IEditorEventReceiver {
  /**
   * Returns whether the pointer is over this container.
   *
   * @returns True when the mouse is over the container.
   */
  get isMouseOver(): boolean;

  /**
   * Returns the root DOM element used for hit-testing.
   *
   * @returns Root HTML element.
   */
  getRootElement(): HTMLElement;

  /**
   * Returns whether a DOM node lies inside this surface.
   *
   * @param node Event target node, or null.
   * @returns True when the node is this root or a descendant.
   */
  containsNode(node: Node | null): boolean;
}
