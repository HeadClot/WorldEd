import { Vector2 } from 'three';
import { TransformMode } from '@/types/transform_mode.js';
import { BoxSelectTool } from './box_select_tool.js';
import { TranslationWidget } from '../widgets/translation_widget.js';
import { tryHandleSingleUseModalKey } from './single_use_axis_constraint_keys.js';
import {
  isSingleUsePointerCompatibleWithPinnedPick,
  resolveSingleUseViewportPointerContext,
} from './single_use_viewport_pointer.js';

/**
 * Translate tool matching Shape Editor TranslateTool: permanent widget mode and
 * single-use grab via UseTool / G.
 */
export class TranslateTool extends BoxSelectTool {
  protected isSingleUseDone: boolean;
  private readonly translationWidget: TranslationWidget;
  protected registerTranslateUndoOperation: boolean;
  private pinnedCamera: import('three').Camera | null;
  private pinnedPickElement: HTMLElement | null;

  /** Creates a translate tool. */
  constructor() {
    super();
    this.isSingleUseDone = false;
    this.translationWidget = new TranslationWidget();
    this.registerTranslateUndoOperation = true;
    this.pinnedCamera = null;
    this.pinnedPickElement = null;
  }

  /** Called when the tool is activated. */
  override onActivate(): void {
    super.onActivate();
    this.isSingleUseDone = false;
    this.pinnedCamera = null;
    this.pinnedPickElement = null;
    if (this.isSingleUse) {
      this.toolOnBeginTranslating();
      return;
    }
    this.activateWidgetPath();
  }

  /** Called when the tool is rendered. */
  override onRender(): void {
    super.onRender();
    if (this.isSingleUse) {
      return;
    }
    this.updateWidgetVisibility();
  }

  /**
   * Called when the tool receives a mouse move event.
   *
   * @param _screenDelta Screen-space movement delta.
   * @param _gridDelta Grid/world-space movement delta.
   */
  override onMouseMove(_screenDelta: Vector2, _gridDelta: Vector2): void {
    if (this.isSingleUse && !this.isSingleUseDone) {
      this.toolOnMouseDrag();
    }
  }

  /**
   * Called when the tool receives a mouse down event.
   *
   * @param button Mouse button index.
   */
  override onMouseDown(button: number): void {
    if (this.isSingleUse) {
      if (button === 0) {
        this.isSingleUseDone = true;
      }
    }
  }

  /**
   * Called when the tool receives a mouse drag event.
   *
   * @param button Mouse button index.
   * @param screenDelta Screen-space movement delta.
   * @param gridDelta Grid/world-space movement delta.
   */
  override onMouseDrag(button: number, screenDelta: Vector2, gridDelta: Vector2): void {
    if (this.isSingleUse) {
      if (button === 0) {
        return;
      }
    }
    super.onMouseDrag(button, screenDelta, gridDelta);
  }

  /**
   * Called when the tool receives a global mouse up event.
   *
   * @param button Mouse button index.
   */
  override onGlobalMouseUp(button: number): void {
    if (this.isSingleUse) {
      if (button === 0) {
        this.isSingleUseDone = true;
        this.commitLiveTransformIfNeeded();
        if (this.parent) {
          this.editor?.switchTool(this.parent);
        }
      }
      return;
    }
    super.onGlobalMouseUp(button);
  }

  /**
   * Gets whether the tool is busy and has to maintain the input focus.
   *
   * @returns True while single-use is not yet done.
   */
  override isBusy(): boolean {
    if (this.isSingleUse) {
      return !this.isSingleUseDone;
    }
    return false;
  }

  /**
   * Called when the tool receives a key down event.
   *
   * @param keyCode Key code string.
   * @param event Optional original browser keyboard event.
   * @returns True when consumed.
   */
  override onKeyDown(keyCode: string, event?: KeyboardEvent): boolean {
    if (this.isSingleUse) {
      return this.handleSingleUseKeyDown(keyCode, event);
    }
    return super.onKeyDown(keyCode, event);
  }

  /**
   * Routes Escape cancel and modal axis/numeric keys during single-use grab.
   *
   * @param keyCode Key code string.
   * @param event Optional original browser keyboard event.
   * @returns True when consumed.
   */
  private handleSingleUseKeyDown(keyCode: string, event?: KeyboardEvent): boolean {
    if (keyCode === 'Escape') {
      this.toolOnCancel();
      return true;
    }
    if (!tryHandleSingleUseModalKey(this.editor?.getServices(), keyCode, event)) {
      return false;
    }
    this.finishSingleUseIfDragEnded();
    return true;
  }

  /** Exits single-use after modal Enter commits (or otherwise ends) the drag. */
  private finishSingleUseIfDragEnded(): void {
    const services = this.editor?.getServices();
    if (!services || services.isTransformDragActive()) {
      return;
    }
    this.isSingleUseDone = true;
    if (this.parent) {
      this.editor?.switchTool(this.parent);
    }
  }

  /** Permanent path: show gizmo and attach translation widget. */
  private activateWidgetPath(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return;
    }
    services.setWidgetMode(TransformMode.TRANSLATE);
    services.refreshGizmoPresentation();
    services.setStatusMessage('Move');
    this.editor.addWidget(this.translationWidget);
    this.translationWidget.onBeginTranslating = () => this.toolOnBeginTranslating();
    this.translationWidget.onMouseDragCallback = () => this.toolOnMouseDrag();
    this.updateWidgetVisibility();
  }

  /** Updates translation widget visibility from selection. */
  private updateWidgetVisibility(): void {
    if (!this.editor) {
      return;
    }
    if (this.editor.selectedSegmentsCount > 0) {
      this.translationWidget.position.copy(this.editor.selectedSegmentsAveragePosition);
      this.translationWidget.visible = true;
      return;
    }
    this.translationWidget.visible = false;
  }

  /** Begins translating: register undo and store initial state. */
  private toolOnBeginTranslating(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return;
    }
    if (this.registerTranslateUndoOperation) {
      this.editor.registerUndo('Translate Selection');
    }
    if (!this.isSingleUse) {
      return;
    }
    this.beginSingleUseDragFromServices();
  }

  /** Applies live mouse-driven translation during single-use. */
  private toolOnMouseDrag(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return;
    }
    if (!services.isTransformDragActive()) {
      return;
    }
    if (!isSingleUsePointerCompatibleWithPinnedPick(this.editor, this.pinnedPickElement)) {
      return;
    }
    const camera = this.pinnedCamera ?? services.getActiveCamera();
    const pickElement = this.pinnedPickElement ?? services.getActivePickElement();
    if (!camera || !pickElement) {
      return;
    }
    services.applySingleUsePointerMove(
      this.editor.lastPointerClientX,
      this.editor.lastPointerClientY,
      camera,
      pickElement,
    );
  }

  /** Cancels the single-use tool operation and undoes all changes. */
  protected toolOnCancel(): void {
    if (!this.editor) {
      return;
    }
    const services = this.editor.getServices();
    services?.cancelActiveTransformDrag();
    this.editor.discardUndo();
    this.isSingleUseDone = true;
    if (this.parent) {
      this.editor.switchTool(this.parent);
    }
  }

  /** Commits live single-use pose before SwitchTool(parent) on mouse up. */
  private commitLiveTransformIfNeeded(): void {
    const services = this.editor?.getServices();
    if (!services) {
      return;
    }
    if (services.isTransformDragActive()) {
      services.commitActiveTransformDrag();
    }
  }

  /** Starts the single-use drag through map transform services. */
  private beginSingleUseDragFromServices(): void {
    const services = this.editor?.getServices();
    if (!services || !this.editor) {
      return;
    }
    const objects = services.getTransformTargets();
    if (objects.length === 0) {
      return;
    }
    const context = resolveSingleUseViewportPointerContext(this.editor, services);
    if (!context) {
      return;
    }
    this.pinnedCamera = context.camera;
    this.pinnedPickElement = context.pickElement;
    services.beginSingleUseDrag(
      TransformMode.TRANSLATE,
      objects,
      services.getTransformPivot(),
      context.camera,
      context.pickElement,
      context.clientX,
      context.clientY,
    );
    services.setStatusMessage('Move (single-use)');
  }
}
