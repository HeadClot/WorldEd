import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { ToolbarIcons } from '@/ui/toolbar/toolbar_icons.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { TransformMode } from '@/types/transform_mode.js';
import { EditorInteractionMode } from '@/types/editor_interaction_mode.js';
import { EditorComponentMode, getEditorComponentModeLabel } from '@/types/editor_component_mode.js';
import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';
import { formatToolInstructionTooltip, type ToolInstruction } from '@/tools/chrome/instruction/tool_instruction.js';
import {
  TOOL_INSTRUCTION_CLIP_COMMIT,
  TOOL_INSTRUCTION_CLIP_FLIP,
  TOOL_INSTRUCTION_CLIP_SPLIT,
  TOOL_INSTRUCTION_COMPONENT_EDGE,
  TOOL_INSTRUCTION_COMPONENT_FACE,
  TOOL_INSTRUCTION_COMPONENT_VERTEX,
  TOOL_INSTRUCTION_EXTRUDE,
  TOOL_INSTRUCTION_UV_EDITOR,
  toolInstructionForTransformMode,
} from '@/tools/chrome/instruction/tool_instruction_catalog.js';
import {
  createViewportToolRailButton,
  styleViewportToolRailButton,
} from '@/tools/chrome/rail/viewport_tool_rail_button.js';
import {
  applyViewportToolOptionsIconButtonMetrics,
  applyViewportToolOptionsTextButtonMetrics,
} from './viewport_tool_options_control_style.js';
import { ViewportToolModeDropdown } from './viewport_tool_mode_dropdown.js';
import { ViewportToolObjectDropdown } from './viewport_tool_object_dropdown.js';
import type { ObjectApplyTransformKind } from '@/types/object_apply_transform_kind.js';

/** Callbacks for tool options actions. */
export interface ViewportToolOptionsBarHandlers {
  onTransformMode: (mode: TransformMode) => void;
  onFlipClipPlane: () => void;
  onCommitClip: () => void;
  onCommitSplit: () => void;
  onOpenUvEditor: () => void;
  onExtrudeFaces: () => void;
  onInteractionMode: (mode: EditorInteractionMode) => void;
  onComponentMode: (mode: EditorComponentMode) => void;
  onApplyObjectTransform?: (kind: ObjectApplyTransformKind) => void;
}

/**
 * Horizontal context bar under the viewport title toolbar (Photoshop-style).
 * Shown only while the pane owns hover.
 */
export class ViewportToolOptionsBar {
  private readonly root: HTMLElement;
  private readonly actionsRow: HTMLElement;
  private readonly transformButtons: Map<TransformMode, HTMLButtonElement>;
  private readonly modeDropdown: ViewportToolModeDropdown;
  private readonly objectDropdown: ViewportToolObjectDropdown;
  private handlers: ViewportToolOptionsBarHandlers;
  private flipButton: HTMLButtonElement;
  private clipButton: HTMLButtonElement;
  private splitButton: HTMLButtonElement;
  private uvButton: HTMLButtonElement;
  private extrudeButton: HTMLButtonElement;
  private activeTransformMode: TransformMode;
  private activeInteractionMode: EditorInteractionMode;
  private activeComponentMode: EditorComponentMode;
  private activeToolId: EditorToolId;
  private readonly componentButtons: Map<EditorComponentMode, HTMLButtonElement>;

  /**
   * Creates the options bar under the pane title toolbar.
   *
   * @param parentElement Pane host element.
   * @param handlers Action callbacks.
   */
  constructor(parentElement: HTMLElement, handlers: ViewportToolOptionsBarHandlers) {
    this.root = parentElement.ownerDocument.createElement('div');
    this.actionsRow = parentElement.ownerDocument.createElement('div');
    this.transformButtons = new Map();
    this.componentButtons = new Map();
    this.handlers = handlers;
    this.activeTransformMode = TransformMode.BOUNDS;
    this.activeInteractionMode = EditorInteractionMode.OBJECT_MODE;
    this.activeComponentMode = EditorComponentMode.VERTEX;
    this.activeToolId = EditorToolId.OBJECT;
    this.modeDropdown = new ViewportToolModeDropdown(this.actionsRow, (mode) => {
      this.handlers.onInteractionMode(mode);
    });
    this.objectDropdown = new ViewportToolObjectDropdown(parentElement, (kind) => {
      this.handlers.onApplyObjectTransform?.(kind);
    });
    this.flipButton = this.createTextAction('Flip', TOOL_INSTRUCTION_CLIP_FLIP, () => {
      this.handlers.onFlipClipPlane();
    });
    this.clipButton = this.createTextAction('Clip', TOOL_INSTRUCTION_CLIP_COMMIT, () => {
      this.handlers.onCommitClip();
    });
    this.splitButton = this.createTextAction('Split', TOOL_INSTRUCTION_CLIP_SPLIT, () => {
      this.handlers.onCommitSplit();
    });
    this.uvButton = this.createTextAction('UV Editor', TOOL_INSTRUCTION_UV_EDITOR, () => {
      this.handlers.onOpenUvEditor();
    });
    this.extrudeButton = this.createTextAction('Extrude', TOOL_INSTRUCTION_EXTRUDE, () => {
      this.handlers.onExtrudeFaces();
    });
    this.styleRoot();
    this.styleActionsRow();
    this.buildTransformButtons();
    this.buildComponentButtons();
    this.root.appendChild(this.actionsRow);
    parentElement.appendChild(this.root);
    this.setActiveTool(EditorToolId.OBJECT);
    this.setActiveTransformMode(TransformMode.BOUNDS);
    this.setActiveInteractionMode(EditorInteractionMode.OBJECT_MODE);
    this.setActiveComponentMode(EditorComponentMode.VERTEX);
    this.setClipActionsEnabled(false);
    this.setVisible(false);
  }

  /**
   * Replaces options action handlers.
   *
   * @param handlers New handlers.
   */
  setHandlers(handlers: ViewportToolOptionsBarHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Highlights the active Edit Mode component mode.
   *
   * @param mode Component mode.
   */
  setActiveComponentMode(mode: EditorComponentMode): void {
    this.activeComponentMode = mode;
    this.componentButtons.forEach((button, buttonMode) => {
      styleViewportToolRailButton(button, buttonMode === mode);
    });
  }

  /**
   * Swaps visible context actions for the active tool.
   *
   * @param toolId Active tool.
   */
  setActiveTool(toolId: EditorToolId): void {
    this.activeToolId = toolId;
    this.rebuildActionsForTool(toolId);
  }

  /**
   * Highlights the active transform mode among object controls.
   *
   * @param mode Transform mode.
   */
  setActiveTransformMode(mode: TransformMode): void {
    this.activeTransformMode = mode;
    this.transformButtons.forEach((button, buttonMode) => {
      styleViewportToolRailButton(button, buttonMode === mode);
    });
  }

  /**
   * Updates the Object Mode / Edit Mode dropdown and context actions.
   *
   * @param mode Interaction mode.
   */
  setActiveInteractionMode(mode: EditorInteractionMode): void {
    this.activeInteractionMode = mode;
    this.modeDropdown.setActiveMode(mode);
    this.rebuildActionsForTool(this.activeToolId);
  }

  /**
   * Enables or disables clip action buttons.
   *
   * @param enabled Whether Flip/Clip/Split may run.
   */
  setClipActionsEnabled(enabled: boolean): void {
    this.flipButton.disabled = !enabled;
    this.clipButton.disabled = !enabled;
    this.splitButton.disabled = !enabled;
    const opacity = enabled ? '1' : '0.45';
    this.flipButton.style.opacity = opacity;
    this.clipButton.style.opacity = opacity;
    this.splitButton.style.opacity = opacity;
  }

  /**
   * Shows or hides the options bar (hover-owned pane only).
   *
   * @param visible True when this pane owns hover.
   */
  setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
  }

  /**
   * Returns the options bar root element.
   *
   * @returns Root element.
   */
  getElement(): HTMLElement {
    return this.root;
  }

  /** Removes the options bar from the DOM. */
  dispose(): void {
    this.modeDropdown.dispose();
    this.objectDropdown.dispose();
    this.root.remove();
    this.transformButtons.clear();
  }

  /**
   * Lays out a content-sized floating strip under the viewport title toolbar
   * (same language as the tool rail: only as wide as its controls).
   */
  private styleRoot(): void {
    this.root.classList.add('editor-viewport-tool-options-bar');
    this.applyFloatingOptionsBarPosition();
    this.applyFloatingOptionsBarChrome();
  }

  /** Positions the options bar under the title toolbar at the content inset. */
  private applyFloatingOptionsBarPosition(): void {
    this.root.style.position = 'absolute';
    this.root.style.left = `${Theme.viewportToolFloatingOffsetLeftPx}px`;
    this.root.style.top = `${Theme.viewportToolbarHeightPx + Theme.viewportToolFloatingOffsetTopPx}px`;
    this.root.style.right = 'auto';
    this.root.style.width = 'max-content';
    this.root.style.maxWidth = 'calc(100% - 20px)';
    this.root.style.height = 'auto';
  }

  /** Applies floating-panel chrome matching the tool rail. */
  private applyFloatingOptionsBarChrome(): void {
    this.root.style.display = 'none';
    this.root.style.alignItems = 'center';
    this.root.style.gap = '6px';
    this.root.style.padding = '4px 6px';
    this.root.style.boxSizing = 'border-box';
    this.root.style.background = hexToRgb(Theme.propertiesPanelBackground);
    this.root.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    this.root.style.borderRadius = '8px';
    this.root.style.boxShadow = '0 10px 28px rgba(0,0,0,0.55)';
    this.root.style.zIndex = String(UiStackLayers.viewportChrome + 1);
    this.root.style.pointerEvents = 'auto';
  }

  /** Styles the left-aligned actions cluster. */
  private styleActionsRow(): void {
    this.actionsRow.style.display = 'flex';
    this.actionsRow.style.alignItems = 'center';
    this.actionsRow.style.gap = '4px';
    this.actionsRow.style.flex = '0 0 auto';
    this.actionsRow.style.width = 'max-content';
  }

  /** Builds Bounds / Move / Rotate / Scale icon buttons once. */
  private buildTransformButtons(): void {
    this.addTransformButton(TransformMode.BOUNDS, ToolbarIcons.toolBounds());
    this.addTransformButton(TransformMode.TRANSLATE, ToolbarIcons.toolMove());
    this.addTransformButton(TransformMode.ROTATE, ToolbarIcons.toolRotate());
    this.addTransformButton(TransformMode.SCALE, ToolbarIcons.toolScale());
  }

  /**
   * Creates one transform mode icon button.
   *
   * @param mode Transform mode.
   * @param svgIcon Icon markup.
   */
  private addTransformButton(mode: TransformMode, svgIcon: string): void {
    const instruction = toolInstructionForTransformMode(mode);
    const button = createViewportToolRailButton(svgIcon, instruction, () => {
      this.handlers.onTransformMode(mode);
    });
    applyViewportToolOptionsIconButtonMetrics(button);
    this.transformButtons.set(mode, button);
  }

  /**
   * Rebuilds the actions row for the active tool context.
   *
   * @param toolId Active tool.
   */
  private rebuildActionsForTool(toolId: EditorToolId): void {
    this.actionsRow.replaceChildren();
    this.actionsRow.appendChild(this.modeDropdown.getElement());
    if (this.activeInteractionMode === EditorInteractionMode.EDIT_MODE) {
      this.appendComponentModeButtons();
      this.appendTransformModeButtons();
      return;
    }
    if (toolId === EditorToolId.FACE) {
      this.actionsRow.appendChild(this.uvButton);
      this.actionsRow.appendChild(this.extrudeButton);
      return;
    }
    if (toolId === EditorToolId.CLIP_PLANE) {
      this.actionsRow.appendChild(this.flipButton);
      this.actionsRow.appendChild(this.clipButton);
      this.actionsRow.appendChild(this.splitButton);
      return;
    }
    this.appendTransformModeButtons();
    this.actionsRow.appendChild(this.objectDropdown.getElement());
  }

  /** Appends Bounds / Move / Rotate / Scale toggles. */
  private appendTransformModeButtons(): void {
    const hideBounds = this.activeInteractionMode === EditorInteractionMode.EDIT_MODE;
    this.transformButtons.forEach((button, mode) => {
      if (hideBounds && mode === TransformMode.BOUNDS) {
        return;
      }
      this.actionsRow.appendChild(button);
    });
    this.setActiveTransformMode(this.activeTransformMode);
  }

  /** Appends Vertex / Edge / Face toggles for Edit Mode. */
  private appendComponentModeButtons(): void {
    this.componentButtons.forEach((button) => {
      this.actionsRow.appendChild(button);
    });
    this.setActiveComponentMode(this.activeComponentMode);
  }

  /** Builds Vertex / Edge / Face text toggles once. */
  private buildComponentButtons(): void {
    this.addComponentButton(EditorComponentMode.VERTEX, TOOL_INSTRUCTION_COMPONENT_VERTEX);
    this.addComponentButton(EditorComponentMode.EDGE, TOOL_INSTRUCTION_COMPONENT_EDGE);
    this.addComponentButton(EditorComponentMode.FACE, TOOL_INSTRUCTION_COMPONENT_FACE);
  }

  /**
   * Creates one Edit Mode component toggle.
   *
   * @param mode Component mode.
   * @param instruction Tooltip instruction.
   */
  private addComponentButton(mode: EditorComponentMode, instruction: ToolInstruction): void {
    const button = this.createTextAction(getEditorComponentModeLabel(mode), instruction, () => {
      this.handlers.onComponentMode(mode);
    });
    this.componentButtons.set(mode, button);
  }

  /**
   * Creates a labeled text action with a native browser tooltip.
   *
   * @param label Visible label.
   * @param instruction Tooltip instruction.
   * @param onClick Click handler.
   * @returns Button element.
   */
  private createTextAction(label: string, instruction: ToolInstruction, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = formatToolInstructionTooltip(instruction);
    button.setAttribute('aria-label', instruction.title);
    applyViewportToolOptionsTextButtonMetrics(button);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }
}
