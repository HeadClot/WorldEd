import { Theme } from '@/theme.js';
import { FloatingPanelStack } from './panel_floating_stack.js';
import { clampFloatingPanelRectToScreen, FLOATING_PANEL_SCREEN_PADDING_PX } from './panel_floating_screen_bounds.js';

/** Startup corner placement relative to the viewport anchor. */
export type FloatingPanelCorner = 'top-left' | 'bottom-left' | 'bottom-right';

/** Construction options for a floating tool window. */
export interface FloatingPanelOptions {
  /** Corner of the anchor used for the first open position. */
  corner: FloatingPanelCorner;
  /**
   * When true, top-left placement sits below the viewport title bar strip. Only
   * applies to top-left corners.
   */
  insetBelowViewportToolbar?: boolean;
  /** Outer padding from the anchor edges in CSS pixels. */
  paddingPx?: number;
}

/**
 * Shared base for floating editor tool windows (Tools, UV Editor, Texture
 * Browser). Owns show/hide, startup anchoring, title-bar drag, screen clamping,
 * and last-clicked z-order via {@link FloatingPanelStack}.
 */
export abstract class PanelFloating {
  protected readonly root: HTMLElement;
  protected readonly host: HTMLElement;
  private defaultAnchor: HTMLElement | null;
  private defaultAnchorResolver: (() => HTMLElement | null) | null;
  private isVisible: boolean;
  private readonly corner: FloatingPanelCorner;
  private readonly insetBelowViewportToolbar: boolean;
  private readonly paddingPx: number;
  private dragOffsetX: number;
  private dragOffsetY: number;
  private isDragging: boolean;

  /**
   * Creates a floating panel shell attached to the host element.
   *
   * @param host Parent element (editor root / toolbar container).
   * @param options Corner and inset options for default placement.
   * @param defaultAnchor Optional viewport container for startup placement.
   */
  protected constructor(host: HTMLElement, options: FloatingPanelOptions, defaultAnchor: HTMLElement | null = null) {
    this.host = host;
    this.defaultAnchor = defaultAnchor;
    this.defaultAnchorResolver = null;
    this.corner = options.corner;
    this.insetBelowViewportToolbar = options.insetBelowViewportToolbar === true;
    this.paddingPx = options.paddingPx ?? FLOATING_PANEL_SCREEN_PADDING_PX;
    this.isVisible = false;
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.root = this.createShellRoot();
    this.host.appendChild(this.root);
    FloatingPanelStack.register(this.root, () => this.clampToScreenIfVisible());
    this.bindBringToFrontOnPointer();
  }

  /**
   * Sets the element used for the default open position.
   *
   * @param anchor Viewport container, or null for host.
   */
  setDefaultAnchor(anchor: HTMLElement | null): void {
    this.defaultAnchor = anchor;
  }

  /**
   * Sets a live anchor resolver invoked on every open and reposition. Prefer
   * this over a static anchor so layout changes (removed startup viewports)
   * still place panels on the largest live perspective pane.
   *
   * @param resolver Callback returning the placement container, or null.
   */
  setDefaultAnchorResolver(resolver: (() => HTMLElement | null) | null): void {
    this.defaultAnchorResolver = resolver;
  }

  /**
   * Returns the current default anchor element when set.
   *
   * @returns Anchor element or null.
   */
  getDefaultAnchor(): HTMLElement | null {
    return this.defaultAnchor;
  }

  /** Shows the panel at the default anchor if it was hidden. */
  show(): void {
    if (this.isVisible) {
      FloatingPanelStack.bringToFront(this.root);
      return;
    }
    this.isVisible = true;
    this.root.style.display = 'flex';
    this.positionDefault();
    this.clampToScreen();
    FloatingPanelStack.bringToFront(this.root);
  }

  /**
   * Hides the panel.
   *
   * @param _force Kept for call-site compatibility; always hides.
   */
  hide(_force: boolean = false): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    this.root.style.display = 'none';
  }

  /** Toggles visibility. */
  toggle(): void {
    if (this.isVisible) {
      this.hide(true);
      return;
    }
    this.show();
  }

  /**
   * Returns whether the panel is visible.
   *
   * @returns True when shown.
   */
  isOpen(): boolean {
    return this.isVisible;
  }

  /** Repositions to the default anchor while visible (startup layout pass). */
  repositionToDefaultAnchor(): void {
    if (!this.isVisible) return;
    this.positionDefault();
    this.clampToScreen();
  }

  /** Clamps the panel into the browser window while it is visible. */
  clampToScreenIfVisible(): void {
    if (!this.isVisible) return;
    this.clampToScreen();
  }

  /** Removes the panel from the DOM and the window stack. */
  dispose(): void {
    this.hide(true);
    FloatingPanelStack.unregister(this.root);
    this.root.remove();
  }

  /**
   * Returns the panel root element (tests / host wiring).
   *
   * @returns Root HTML element.
   */
  getRootElement(): HTMLElement {
    return this.root;
  }

  /**
   * Binds title-bar drag that keeps the panel inside the screen.
   *
   * @param bar Title bar element.
   */
  protected bindTitleBarDrag(bar: HTMLElement): void {
    bar.addEventListener('pointerdown', (event) => this.onTitleBarPointerDown(event));
  }

  /**
   * Applies a free top/left position and clears bottom/right anchors.
   *
   * @param left CSS left in pixels.
   * @param top CSS top in pixels.
   */
  protected setTopLeftPosition(left: number, top: number): void {
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.bottom = 'auto';
    this.root.style.right = 'auto';
  }

  /**
   * Converts a bottom-anchored layout to top/left using the current rect.
   *
   * @param rect Current panel bounding rect.
   */
  protected convertBottomToTopPosition(rect: DOMRect): void {
    this.setTopLeftPosition(rect.left, rect.top);
  }

  /** Clamps the current panel rect into the browser window. */
  protected clampToScreen(): void {
    const rect = this.root.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const clamped = clampFloatingPanelRectToScreen(
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      window.innerWidth,
      window.innerHeight,
      this.paddingPx,
    );
    this.setTopLeftPosition(clamped.left, clamped.top);
  }

  /**
   * Creates the shell root element; subclasses fill it after super().
   *
   * @returns Empty flex column root (hidden).
   */
  private createShellRoot(): HTMLElement {
    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.display = 'none';
    root.style.flexDirection = 'column';
    root.style.userSelect = 'none';
    return root;
  }

  /** Raises this panel when the user interacts with it. */
  private bindBringToFrontOnPointer(): void {
    this.root.addEventListener('pointerdown', () => {
      FloatingPanelStack.bringToFront(this.root);
    });
  }

  /**
   * Starts title-bar drag when the pointer is not on a button.
   *
   * @param event Pointer down on the title bar.
   */
  private onTitleBarPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON') return;
    this.beginDrag(event);
  }

  /**
   * Begins a drag session with screen clamping on move.
   *
   * @param event Pointer down event.
   */
  private beginDrag(event: PointerEvent): void {
    this.isDragging = true;
    FloatingPanelStack.bringToFront(this.root);
    const rect = this.root.getBoundingClientRect();
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    this.convertBottomToTopPosition(rect);
    const onMove = (moveEvent: PointerEvent) => this.onDragMove(moveEvent);
    const onUp = () => {
      this.isDragging = false;
      this.clampToScreen();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /**
   * Updates panel position while dragging, clamped to the screen.
   *
   * @param moveEvent Pointer move event.
   */
  private onDragMove(moveEvent: PointerEvent): void {
    if (!this.isDragging) return;
    const rect = this.root.getBoundingClientRect();
    const nextLeft = moveEvent.clientX - this.dragOffsetX;
    const nextTop = moveEvent.clientY - this.dragOffsetY;
    const clamped = clampFloatingPanelRectToScreen(
      { left: nextLeft, top: nextTop, width: rect.width, height: rect.height },
      window.innerWidth,
      window.innerHeight,
      this.paddingPx,
    );
    this.setTopLeftPosition(clamped.left, clamped.top);
  }

  /** Places the panel at the configured corner of the live placement anchor. */
  private positionDefault(): void {
    const anchor = this.resolvePlacementAnchor();
    const rect = anchor.getBoundingClientRect();
    const size = this.resolvePanelSizeForPlacement();
    const leftTop = this.computeDefaultLeftTop(rect, size.width, size.height);
    this.setTopLeftPosition(leftTop.left, leftTop.top);
  }

  /**
   * Resolves the element used for default corner placement. Live resolvers win
   * so each open rescans viewports; disconnected static anchors are ignored so
   * removed panes cannot pin panels at 0,0.
   *
   * @returns Anchor container for placement (never null).
   */
  private resolvePlacementAnchor(): HTMLElement {
    const liveAnchor = this.defaultAnchorResolver?.() ?? null;
    if (liveAnchor) {
      this.defaultAnchor = liveAnchor;
      return liveAnchor;
    }
    if (this.defaultAnchor?.isConnected) {
      return this.defaultAnchor;
    }
    this.defaultAnchor = null;
    return this.host;
  }

  /**
   * Resolves panel size for corner placement, preferring live layout then CSS.
   *
   * @returns Width and height in CSS pixels.
   */
  private resolvePanelSizeForPlacement(): { width: number; height: number } {
    const size = this.root.getBoundingClientRect();
    if (size.width > 0 && size.height > 0) {
      return { width: size.width, height: size.height };
    }
    const styleWidth = parseFloat(this.root.style.width);
    const styleHeight = parseFloat(this.root.style.height);
    return {
      width: Number.isFinite(styleWidth) && styleWidth > 0 ? styleWidth : 212,
      height: Number.isFinite(styleHeight) && styleHeight > 0 ? styleHeight : 200,
    };
  }

  /**
   * Computes default left/top for the configured corner inside an anchor rect.
   *
   * @param anchorRect Anchor getBoundingClientRect.
   * @param panelWidth Panel width in CSS pixels.
   * @param panelHeight Panel height in CSS pixels.
   * @returns Unclamped left/top.
   */
  private computeDefaultLeftTop(
    anchorRect: DOMRect,
    panelWidth: number,
    panelHeight: number,
  ): { left: number; top: number } {
    const pad = this.paddingPx;
    if (this.corner === 'top-left') {
      const topInset = this.insetBelowViewportToolbar ? Theme.viewportToolbarHeightPx + pad : pad;
      return { left: anchorRect.left + pad, top: anchorRect.top + topInset };
    }
    if (this.corner === 'bottom-left') {
      return {
        left: anchorRect.left + pad,
        top: anchorRect.bottom - panelHeight - pad,
      };
    }
    return {
      left: anchorRect.right - panelWidth - pad,
      top: anchorRect.bottom - panelHeight - pad,
    };
  }
}
