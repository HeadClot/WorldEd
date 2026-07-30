import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { ToolbarIcons } from '@/ui/toolbar/toolbar_icons.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { TransformMode } from '@/types/transform_mode.js';
import { PanelFloating } from '@/ui/floating_panel/panel_floating.js';

/** Callbacks the Tools palette uses for tool activation and context actions. */
export interface ToolsPaletteHandlers {
  onSelectTool: (toolId: EditorToolId) => void;
  onTransformMode: (mode: TransformMode) => void;
  onFlipClipPlane: () => void;
  onCommitClip: () => void;
  onCommitSplit: () => void;
  onOpenUvEditor: () => void;
  onExtrudeFaces: () => void;
}

/**
 * Floating tool palette with context-sensitive actions per active tool. Object
 * mode shows transform modes; face mode shows UV/extrude; clip shows cut
 * actions. Placement and windowing come from {@link FloatingPanel}.
 */
export class ToolsPalette extends PanelFloating {
  private handlers: ToolsPaletteHandlers;
  private activeTool: EditorToolId;
  private activeTransformMode: TransformMode;
  private toolButtons: Map<EditorToolId, HTMLButtonElement>;
  private transformButtons: Map<TransformMode, HTMLButtonElement>;
  private statusLabel: HTMLElement;
  private contextHeader: HTMLElement;
  private hintLabel: HTMLElement;
  private objectContext: HTMLElement;
  private faceContext: HTMLElement;
  private clipContext: HTMLElement;
  private flipButton: HTMLButtonElement;
  private clipButton: HTMLButtonElement;
  private splitButton: HTMLButtonElement;

  /**
   * Creates a tools palette attached to the host element.
   *
   * @param host Parent element (editor root).
   * @param handlers Tool and context action callbacks.
   * @param defaultAnchor Element whose top-left is the default panel position.
   */
  constructor(host: HTMLElement, handlers: ToolsPaletteHandlers, defaultAnchor: HTMLElement | null = null) {
    super(host, { corner: 'top-left', insetBelowViewportToolbar: true }, defaultAnchor);
    this.handlers = handlers;
    this.activeTool = EditorToolId.OBJECT;
    this.activeTransformMode = TransformMode.BOUNDS;
    this.toolButtons = new Map();
    this.transformButtons = new Map();
    this.statusLabel = document.createElement('div');
    this.contextHeader = document.createElement('div');
    this.hintLabel = document.createElement('div');
    this.objectContext = document.createElement('div');
    this.faceContext = document.createElement('div');
    this.clipContext = document.createElement('div');
    this.flipButton = document.createElement('button');
    this.clipButton = document.createElement('button');
    this.splitButton = document.createElement('button');
    this.populateRoot();
    this.setActiveTool(EditorToolId.OBJECT);
    this.setActiveTransformMode(TransformMode.BOUNDS);
    this.setContextStatus('Select objects in the viewport');
    this.setClipActionsEnabled(false);
  }

  /**
   * Returns the currently active tool id.
   *
   * @returns Active EditorToolId.
   */
  getActiveTool(): EditorToolId {
    return this.activeTool;
  }

  /**
   * Returns the highlighted transform mode.
   *
   * @returns Active TransformMode.
   */
  getActiveTransformMode(): TransformMode {
    return this.activeTransformMode;
  }

  /**
   * Updates which tool icon appears selected and swaps the context panel.
   *
   * @param toolId Tool to highlight.
   */
  setActiveTool(toolId: EditorToolId): void {
    this.activeTool = toolId;
    this.toolButtons.forEach((button, id) => {
      this.styleToolButton(button, id === toolId);
    });
    this.contextHeader.textContent = this.formatToolTitle(toolId);
    this.hintLabel.textContent = this.formatToolHint(toolId);
    this.updateContextVisibility(toolId);
  }

  /**
   * Highlights the active transform mode among object-context buttons.
   *
   * @param mode Transform mode to mark active.
   */
  setActiveTransformMode(mode: TransformMode): void {
    this.activeTransformMode = mode;
    this.transformButtons.forEach((button, buttonMode) => {
      this.styleToolButton(button, buttonMode === mode);
    });
  }

  /**
   * Updates the contextual status line under the tool strip.
   *
   * @param message Status text.
   */
  setContextStatus(message: string): void {
    this.statusLabel.textContent = message;
  }

  /**
   * Enables or disables clip action buttons when a plane is ready.
   *
   * @param enabled Whether Flip/Clip/Split can be pressed.
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

  /** Fills the shared floating-panel shell with Tools chrome. */
  private populateRoot(): void {
    this.styleRoot(this.root);
    this.root.appendChild(this.buildTitleBar());
    this.root.appendChild(this.buildToolGrid());
    this.root.appendChild(this.buildContextSection());
  }

  /**
   * Applies chrome styles to the floating panel.
   *
   * @param root Panel root.
   */
  private styleRoot(root: HTMLElement): void {
    root.classList.add('editor-tools-palette');
    root.style.width = '212px';
    root.style.background = hexToRgb(Theme.propertiesPanelBackground);
    root.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    root.style.borderRadius = '8px';
    root.style.boxShadow = '0 10px 28px rgba(0,0,0,0.55)';
    root.style.fontFamily = Theme.uiFontFamily;
    root.style.paddingBottom = '10px';
  }

  /**
   * Builds the draggable title bar with close control.
   *
   * @returns Title bar element.
   */
  private buildTitleBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.gap = '6px';
    bar.style.padding = '8px 10px';
    bar.style.cursor = 'move';
    bar.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    const title = document.createElement('span');
    title.textContent = 'Tools';
    title.style.flex = '1';
    title.style.color = Theme.buttonTextColor;
    title.style.fontSize = '12px';
    title.style.fontWeight = '600';
    title.style.letterSpacing = '0.02em';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close';
    this.styleSmallButton(close);
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide(true);
    });
    bar.appendChild(title);
    bar.appendChild(close);
    this.bindTitleBarDrag(bar);
    return bar;
  }

  /**
   * Builds the primary tool mode grid (always visible).
   *
   * @returns Grid element.
   */
  private buildToolGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr 1fr';
    grid.style.gap = '6px';
    grid.style.padding = '10px 10px 6px';
    this.addToolButton(grid, EditorToolId.OBJECT, 'Object Select', ToolbarIcons.toolObjectSelect());
    this.addToolButton(grid, EditorToolId.FACE, 'Face Select', ToolbarIcons.toolFaceSelect());
    this.addToolButton(grid, EditorToolId.CLIP_PLANE, 'Clip Plane', ToolbarIcons.toolClipPlane());
    return grid;
  }

  /**
   * Adds one primary tool button to the grid.
   *
   * @param grid Parent grid.
   * @param toolId Tool identifier.
   * @param title Tooltip label.
   * @param svgIcon SVG markup.
   */
  private addToolButton(grid: HTMLElement, toolId: EditorToolId, title: string, svgIcon: string): void {
    const button = this.createIconActionButton(title, svgIcon, () => {
      this.handlers.onSelectTool(toolId);
    });
    this.toolButtons.set(toolId, button);
    this.styleToolButton(button, false);
    grid.appendChild(button);
  }

  /**
   * Builds the contextual section that swaps content per tool.
   *
   * @returns Context section element.
   */
  private buildContextSection(): HTMLElement {
    const section = document.createElement('div');
    section.style.padding = '4px 10px 0';
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '6px';
    this.styleMutedLabel(this.contextHeader, true);
    this.styleMutedLabel(this.statusLabel, false);
    this.styleMutedLabel(this.hintLabel, false);
    this.hintLabel.style.opacity = '0.85';
    this.buildObjectContext();
    this.buildFaceContext();
    this.buildClipContext();
    section.appendChild(this.contextHeader);
    section.appendChild(this.statusLabel);
    section.appendChild(this.objectContext);
    section.appendChild(this.faceContext);
    section.appendChild(this.clipContext);
    section.appendChild(this.hintLabel);
    return section;
  }

  /** Builds object-select context: Bounds / Move / Rotate / Scale. */
  private buildObjectContext(): void {
    this.styleContextPanel(this.objectContext, 'object');
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 1fr 1fr 1fr';
    row.style.gap = '4px';
    this.addTransformButton(row, TransformMode.BOUNDS, 'Bounds (T)', ToolbarIcons.toolBounds());
    this.addTransformButton(row, TransformMode.TRANSLATE, 'Move (W)', ToolbarIcons.toolMove());
    this.addTransformButton(row, TransformMode.ROTATE, 'Rotate (E)', ToolbarIcons.toolRotate());
    this.addTransformButton(row, TransformMode.SCALE, 'Scale (R)', ToolbarIcons.toolScale());
    this.objectContext.appendChild(row);
  }

  /** Builds face-select context: UV Editor and Extrude. */
  private buildFaceContext(): void {
    this.styleContextPanel(this.faceContext, 'face');
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 1fr';
    row.style.gap = '4px';
    const uvButton = this.createTextActionButton('UV Editor', () => {
      this.handlers.onOpenUvEditor();
    });
    uvButton.title = 'Open UV Editor';
    const extrudeButton = this.createTextActionButton('Extrude', () => {
      this.handlers.onExtrudeFaces();
    });
    extrudeButton.title = 'Extrude selected faces (Shift+E)';
    row.appendChild(uvButton);
    row.appendChild(extrudeButton);
    this.faceContext.appendChild(row);
  }

  /** Builds clip-plane context: Flip / Clip / Split. */
  private buildClipContext(): void {
    this.styleContextPanel(this.clipContext, 'clip');
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '4px';
    this.configureActionButton(this.flipButton, 'Flip', () => {
      this.handlers.onFlipClipPlane();
    });
    this.configureActionButton(this.clipButton, 'Clip', () => {
      this.handlers.onCommitClip();
    });
    this.configureActionButton(this.splitButton, 'Split', () => {
      this.handlers.onCommitSplit();
    });
    row.appendChild(this.flipButton);
    row.appendChild(this.clipButton);
    row.appendChild(this.splitButton);
    this.clipContext.appendChild(row);
  }

  /**
   * Applies shared layout styles to a context panel container.
   *
   * @param panel Context panel element.
   * @param contextName Stable data attribute used by tests and tooling.
   */
  private styleContextPanel(panel: HTMLElement, contextName: string): void {
    panel.dataset['context'] = contextName;
    panel.style.display = 'none';
    panel.style.flexDirection = 'column';
    panel.style.gap = '4px';
  }

  /**
   * Shows only the context panel matching the active tool.
   *
   * @param toolId Active tool id.
   */
  private updateContextVisibility(toolId: EditorToolId): void {
    this.objectContext.style.display = toolId === EditorToolId.OBJECT ? 'flex' : 'none';
    this.faceContext.style.display = toolId === EditorToolId.FACE ? 'flex' : 'none';
    this.clipContext.style.display = toolId === EditorToolId.CLIP_PLANE ? 'flex' : 'none';
  }

  /**
   * Adds a transform mode icon button to the object context row.
   *
   * @param row Parent row.
   * @param mode Transform mode.
   * @param title Tooltip including shortcut.
   * @param svgIcon Icon markup.
   */
  private addTransformButton(row: HTMLElement, mode: TransformMode, title: string, svgIcon: string): void {
    const button = this.createIconActionButton(title, svgIcon, () => {
      this.handlers.onTransformMode(mode);
    });
    this.transformButtons.set(mode, button);
    this.styleToolButton(button, false);
    row.appendChild(button);
  }

  /**
   * Creates a square icon action button used in tool strips.
   *
   * @param title Accessible name and tooltip.
   * @param svgIcon SVG markup.
   * @param onClick Click handler.
   * @returns Configured button.
   */
  private createIconActionButton(title: string, svgIcon: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = svgIcon;
    button.style.width = '100%';
    button.style.height = '34px';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  /**
   * Creates a labeled text action button for context panels.
   *
   * @param label Visible label.
   * @param onClick Click handler.
   * @returns Configured button.
   */
  private createTextActionButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    this.configureActionButton(button, label, onClick);
    return button;
  }

  /**
   * Styles a tool or transform button active or idle state.
   *
   * @param button Button element.
   * @param active Whether the control is selected.
   */
  private styleToolButton(button: HTMLButtonElement, active: boolean): void {
    button.style.border = active
      ? `1px solid ${hexToRgb(Theme.selectionColor)}`
      : `1px solid ${Theme.inputBorderColor}`;
    button.style.background = active ? 'rgba(232, 106, 23, 0.28)' : hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
  }

  /**
   * Configures a contextual text action button.
   *
   * @param button Button element.
   * @param label Visible label.
   * @param onClick Click handler.
   */
  private configureActionButton(button: HTMLButtonElement, label: string, onClick: () => void): void {
    button.type = 'button';
    button.textContent = label;
    button.style.flex = '1';
    button.style.border = `1px solid ${Theme.inputBorderColor}`;
    button.style.borderRadius = '4px';
    button.style.background = hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.fontSize = '11px';
    button.style.fontWeight = '500';
    button.style.padding = '6px 0';
    button.style.cursor = 'pointer';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
  }

  /**
   * Formats the context header for a tool.
   *
   * @param toolId Active tool.
   * @returns Display title.
   */
  private formatToolTitle(toolId: EditorToolId): string {
    if (toolId === EditorToolId.FACE) return 'Face Select';
    if (toolId === EditorToolId.CLIP_PLANE) return 'Clip Plane';
    return 'Object Select';
  }

  /**
   * Formats shortcut hints for a tool.
   *
   * @param toolId Active tool.
   * @returns Hint text.
   */
  private formatToolHint(toolId: EditorToolId): string {
    if (toolId === EditorToolId.CLIP_PLANE) {
      return 'F flip · Enter clip · X split · Esc cancel';
    }
    if (toolId === EditorToolId.FACE) {
      return 'Click faces · Shift+E extrude · Tab object';
    }
    return 'W move · E rotate · R scale · T bounds · Tab face';
  }

  /**
   * Applies muted label styles used for headers and status lines.
   *
   * @param label Label element.
   * @param emphasize Whether to use stronger weight and color.
   */
  private styleMutedLabel(label: HTMLElement, emphasize: boolean): void {
    label.style.color = emphasize ? Theme.buttonTextColor : Theme.statusBarTextColor;
    label.style.fontFamily = Theme.uiFontFamily;
    label.style.fontSize = emphasize ? '11px' : '10px';
    label.style.fontWeight = emphasize ? '600' : '400';
    label.style.lineHeight = '1.35';
  }

  /**
   * Styles a small title-bar button.
   *
   * @param button Button element.
   */
  private styleSmallButton(button: HTMLButtonElement): void {
    button.style.border = `1px solid ${Theme.inputBorderColor}`;
    button.style.borderRadius = '4px';
    button.style.background = hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.fontSize = '12px';
    button.style.padding = '2px 7px';
    button.style.cursor = 'pointer';
    button.style.lineHeight = '1.2';
  }
}
