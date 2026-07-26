import { Theme } from '../../theme.js';
import { hexToRgb } from '../../utils/color_utils.js';
import { ToolbarIcons } from '../toolbar_icons.js';
import { FaceTextureAlign, FaceTextureMappingTrs } from '../../texture/uv/face_texture_mapping.js';
import type { UvEditorTrsFieldState } from '../../texture/uv/face_texture_applier.js';
import { UV_OFFSET_NUDGE, type UvRelativeTrsOp } from '../../texture/uv/uv_trs_ops.js';
import { FloatingPanelStack } from '../floating_panel_stack.js';

/** Unity-style dash for mixed multi-selection values. */
const MIXED_VALUE_DISPLAY = '—';

/**
 * Fixed layout metrics for a neat UV editor grid. Top icons and field rows use
 * the same content width: four 30px cells with 4px gaps (= label+field+2
 * btns).
 */
const UV_LAYOUT = {
  panelPaddingX: 8,
  rowGap: 4,
  sectionGapY: 2,
  labelWidth: 12,
  fieldWidth: 48,
  fieldHeight: 24,
  /** Shared width for align icons and every nudge button. */
  controlWidth: 30,
  controlHeight: 24,
  iconHeight: 26,
  /**
   * Content grid width: 4×30 + 3×4 = 132, equal to
   * label(12)+gap+field(48)+gap+btn(30)+gap+btn(30).
   */
  contentWidth: 12 + 4 + 48 + 4 + 30 + 4 + 30,
} as const;

/** Panel outer width: horizontal padding + content grid. */
const UV_PANEL_WIDTH_PX = UV_LAYOUT.panelPaddingX * 2 + UV_LAYOUT.contentWidth;

/** Callbacks the UV editor uses to apply texture mapping operations. */
export interface UvEditorHandlers {
  onAlign: (align: FaceTextureAlign) => void;
  onApplyPartialTrs: (fields: Partial<FaceTextureMappingTrs>) => void;
  onRelativeOp: (op: UvRelativeTrsOp) => void;
  onReset: () => void;
}

/**
 * Floating UV editor for face texture mapping. Compact numeric fields with
 * Hammer/TrenchBroom-style nudge buttons (×2 / ½ scale, ±¼ tile offset, ±90°
 * rotation) and multi-select support (mixed dashes + relative ops on all).
 */
export class UvEditor {
  private root: HTMLElement;
  private host: HTMLElement;
  private handlers: UvEditorHandlers;
  private defaultAnchor: HTMLElement | null;
  private isVisible: boolean;
  private scaleUInput: HTMLInputElement;
  private scaleVInput: HTMLInputElement;
  private offsetUInput: HTMLInputElement;
  private offsetVInput: HTMLInputElement;
  private rotationInput: HTMLInputElement;
  private statusLabel: HTMLElement;
  private dragOffsetX: number;
  private dragOffsetY: number;
  private isDragging: boolean;
  private lastAlign: FaceTextureAlign;
  private suppressFieldEmit: boolean;

  /**
   * Creates a UV editor attached to the host element.
   *
   * @param host Parent element (editor root).
   * @param handlers Apply callbacks.
   * @param defaultAnchor Element whose bottom-left anchors the default panel
   *   position.
   */
  constructor(host: HTMLElement, handlers: UvEditorHandlers, defaultAnchor: HTMLElement | null = null) {
    this.host = host;
    this.handlers = handlers;
    this.defaultAnchor = defaultAnchor;
    this.isVisible = false;
    this.isDragging = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.lastAlign = 'auto';
    this.suppressFieldEmit = false;
    this.scaleUInput = document.createElement('input');
    this.scaleVInput = document.createElement('input');
    this.offsetUInput = document.createElement('input');
    this.offsetVInput = document.createElement('input');
    this.rotationInput = document.createElement('input');
    this.statusLabel = document.createElement('div');
    this.root = this.buildRoot();
    this.host.appendChild(this.root);
    this.setFromFieldState({
      scaleU: 1,
      scaleV: 1,
      offsetU: 0,
      offsetV: 0,
      rotationDeg: 0,
      align: 'auto',
      targetCount: 0,
    });
  }

  /**
   * Sets the element used for the default open position (bottom-left of
   * anchor).
   *
   * @param anchor Viewport or other container element, or null for host.
   */
  setDefaultAnchor(anchor: HTMLElement | null): void {
    this.defaultAnchor = anchor;
  }

  /** Shows the UV editor at the default anchor (bottom-left of the 3D viewport). */
  show(): void {
    if (this.isVisible) {
      FloatingPanelStack.bringToFront(this.root);
      return;
    }
    this.isVisible = true;
    this.root.style.display = 'flex';
    this.positionDefault();
    FloatingPanelStack.bringToFront(this.root);
  }

  /**
   * Hides the UV editor.
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

  /**
   * Updates numeric fields from shared/mixed TRS state.
   *
   * @param fields Per-field state (null = mixed).
   */
  setFromFieldState(fields: UvEditorTrsFieldState): void {
    this.suppressFieldEmit = true;
    this.lastAlign = fields.align ?? this.lastAlign;
    this.writeField(this.scaleUInput, fields.scaleU, 2);
    this.writeField(this.scaleVInput, fields.scaleV, 2);
    this.writeField(this.offsetUInput, fields.offsetU, 2);
    this.writeField(this.offsetVInput, fields.offsetV, 2);
    this.writeField(this.rotationInput, fields.rotationDeg, 1);
    this.statusLabel.textContent =
      fields.targetCount === 0 ? 'No surfaces selected' : `${fields.targetCount} face region(s)`;
    this.suppressFieldEmit = false;
  }

  /**
   * Legacy refresh API used by older call sites. Prefer setFromFieldState.
   *
   * @param mapping Common mapping or null when mixed.
   * @param targetCount Number of targeted regions.
   */
  setFromSelection(mapping: { align?: FaceTextureAlign } | null, targetCount: number): void {
    if (!mapping) {
      this.setFromFieldState({
        scaleU: null,
        scaleV: null,
        offsetU: null,
        offsetV: null,
        rotationDeg: null,
        align: null,
        targetCount,
      });
      return;
    }
    const trs = mapping as {
      scaleU?: number;
      scaleV?: number;
      offsetU?: number;
      offsetV?: number;
      rotationDeg?: number;
      align?: FaceTextureAlign;
    };
    this.setFromFieldState({
      scaleU: trs.scaleU ?? 1,
      scaleV: trs.scaleV ?? 1,
      offsetU: trs.offsetU ?? 0,
      offsetV: trs.offsetV ?? 0,
      rotationDeg: trs.rotationDeg ?? 0,
      align: mapping.align ?? 'auto',
      targetCount,
    });
  }

  /** Disposes DOM and listeners. */
  dispose(): void {
    this.hide(true);
    if (this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
  }

  /**
   * Builds the root panel element.
   *
   * @returns Styled root.
   */
  private buildRoot(): HTMLElement {
    const root = document.createElement('div');
    this.styleRoot(root);
    root.appendChild(this.buildTitleBar());
    root.appendChild(this.buildIconStrip());
    root.appendChild(this.buildScaleSection());
    root.appendChild(this.buildOffsetSection());
    root.appendChild(this.buildRotationSection());
    this.styleStatusLabel();
    root.appendChild(this.statusLabel);
    this.bindNumericApply();
    return root;
  }

  /**
   * Applies chrome styles to the floating panel.
   *
   * @param root Panel root.
   */
  private styleRoot(root: HTMLElement): void {
    root.style.position = 'fixed';
    root.style.display = 'none';
    root.style.flexDirection = 'column';
    root.style.width = `${UV_PANEL_WIDTH_PX}px`;
    root.style.boxSizing = 'border-box';
    root.style.background = hexToRgb(Theme.propertiesPanelBackground);
    root.style.border = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    root.style.borderRadius = '6px';
    root.style.boxShadow = '0 8px 24px rgba(0,0,0,0.55)';
    root.style.fontFamily = Theme.uiFontFamily;
    root.style.userSelect = 'none';
    root.style.paddingBottom = '8px';
    this.bindBringToFrontOnPointer(root);
  }

  /**
   * Raises this panel above other floating windows when the user interacts with
   * it.
   *
   * @param root Panel root element.
   */
  private bindBringToFrontOnPointer(root: HTMLElement): void {
    root.addEventListener('pointerdown', () => {
      FloatingPanelStack.bringToFront(root);
    });
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
    bar.style.padding = `6px ${UV_LAYOUT.panelPaddingX}px`;
    bar.style.cursor = 'move';
    bar.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    const title = document.createElement('span');
    title.textContent = 'UV Editor';
    title.style.flex = '1';
    title.style.color = Theme.buttonTextColor;
    title.style.fontSize = '12px';
    title.style.fontWeight = '600';
    title.style.fontFamily = 'monospace';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close';
    this.styleChromeButton(close);
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      this.hide(true);
    });
    bar.appendChild(title);
    bar.appendChild(close);
    this.bindDrag(bar);
    return bar;
  }

  /**
   * Builds the align/reset icon strip. Four equal controls packed with the same
   * gap as field rows (not space-between).
   *
   * @returns Icon strip element.
   */
  private buildIconStrip(): HTMLElement {
    const strip = document.createElement('div');
    strip.style.display = 'flex';
    strip.style.gap = `${UV_LAYOUT.rowGap}px`;
    strip.style.padding = `6px ${UV_LAYOUT.panelPaddingX}px 4px`;
    strip.style.justifyContent = 'flex-start';
    strip.style.boxSizing = 'border-box';
    strip.appendChild(this.createIconButton('Floor', ToolbarIcons.alignFloor(), () => this.handlers.onAlign('floor')));
    strip.appendChild(this.createIconButton('Wall', ToolbarIcons.alignWall(), () => this.handlers.onAlign('wall')));
    strip.appendChild(
      this.createIconButton('Ceiling', ToolbarIcons.alignCeiling(), () => this.handlers.onAlign('ceiling')),
    );
    strip.appendChild(this.createIconButton('Reset', ToolbarIcons.textureReset(), () => this.handlers.onReset()));
    return strip;
  }

  /**
   * Builds the scale section with ×2 / ½ buttons per axis.
   *
   * @returns Section element.
   */
  private buildScaleSection(): HTMLElement {
    const section = this.createSection('Scale');
    section.appendChild(
      this.buildAxisRowWithButtons('U', this.scaleUInput, 0.25, [
        { label: '×2', title: 'Double U scale (larger tiles)', op: { kind: 'multiplyScale', axis: 'u', factor: 2 } },
        { label: '½', title: 'Halve U scale (smaller tiles)', op: { kind: 'multiplyScale', axis: 'u', factor: 0.5 } },
      ]),
    );
    section.appendChild(
      this.buildAxisRowWithButtons('V', this.scaleVInput, 0.25, [
        { label: '×2', title: 'Double V scale (larger tiles)', op: { kind: 'multiplyScale', axis: 'v', factor: 2 } },
        { label: '½', title: 'Halve V scale (smaller tiles)', op: { kind: 'multiplyScale', axis: 'v', factor: 0.5 } },
      ]),
    );
    return section;
  }

  /**
   * Builds the offset section with ±¼ tile nudge buttons.
   *
   * @returns Section element.
   */
  private buildOffsetSection(): HTMLElement {
    const section = this.createSection('Offset');
    const step = UV_OFFSET_NUDGE;
    section.appendChild(
      this.buildAxisRowWithButtons('U', this.offsetUInput, step, [
        { label: '−¼', title: 'Shift U by −¼ tile', op: { kind: 'addOffset', axis: 'u', delta: -step } },
        { label: '+¼', title: 'Shift U by +¼ tile', op: { kind: 'addOffset', axis: 'u', delta: step } },
      ]),
    );
    section.appendChild(
      this.buildAxisRowWithButtons('V', this.offsetVInput, step, [
        { label: '−¼', title: 'Shift V by −¼ tile', op: { kind: 'addOffset', axis: 'v', delta: -step } },
        { label: '+¼', title: 'Shift V by +¼ tile', op: { kind: 'addOffset', axis: 'v', delta: step } },
      ]),
    );
    return section;
  }

  /**
   * Builds the rotation section with ±90° buttons.
   *
   * @returns Section element.
   */
  private buildRotationSection(): HTMLElement {
    const section = this.createSection('Rotation');
    section.appendChild(
      this.buildAxisRowWithButtons('°', this.rotationInput, 1, [
        { label: '−90', title: 'Rotate UV −90°', op: { kind: 'addRotation', degrees: -90 } },
        { label: '+90', title: 'Rotate UV +90°', op: { kind: 'addRotation', degrees: 90 } },
      ]),
    );
    return section;
  }

  /**
   * Creates a labeled section container.
   *
   * @param title Section title.
   * @returns Section element.
   */
  private createSection(title: string): HTMLElement {
    const section = document.createElement('div');
    section.style.padding = `${UV_LAYOUT.sectionGapY}px ${UV_LAYOUT.panelPaddingX}px`;
    section.style.boxSizing = 'border-box';
    const header = document.createElement('div');
    header.textContent = title;
    header.style.color = Theme.buttonTextColor;
    header.style.fontFamily = 'monospace';
    header.style.fontSize = '11px';
    header.style.marginBottom = '3px';
    section.appendChild(header);
    return section;
  }

  /**
   * Builds one labeled input row with fixed-width nudge buttons.
   *
   * @param label Axis label.
   * @param input Input element.
   * @param step Input step.
   * @param buttons Nudge button specs.
   * @returns Row element.
   */
  private buildAxisRowWithButtons(
    label: string,
    input: HTMLInputElement,
    step: number,
    buttons: Array<{ label: string; title: string; op: UvRelativeTrsOp }>,
  ): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = `${UV_LAYOUT.labelWidth}px ${UV_LAYOUT.fieldWidth}px ${UV_LAYOUT.controlWidth}px ${UV_LAYOUT.controlWidth}px`;
    row.style.columnGap = `${UV_LAYOUT.rowGap}px`;
    row.style.alignItems = 'center';
    row.style.marginBottom = '3px';
    row.style.width = `${UV_LAYOUT.contentWidth}px`;
    row.style.boxSizing = 'border-box';
    row.appendChild(this.createAxisLabel(label));
    this.configureNumberInput(input, step);
    row.appendChild(input);
    buttons.forEach((spec) => {
      row.appendChild(this.createNudgeButton(spec.label, spec.title, () => this.handlers.onRelativeOp(spec.op)));
    });
    return row;
  }

  /**
   * Creates a narrow axis label.
   *
   * @param label Label text.
   * @returns Label element.
   */
  private createAxisLabel(label: string): HTMLElement {
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.width = `${UV_LAYOUT.labelWidth}px`;
    labelEl.style.flexShrink = '0';
    labelEl.style.color = Theme.buttonTextColor;
    labelEl.style.fontFamily = 'monospace';
    labelEl.style.fontSize = '11px';
    labelEl.style.lineHeight = `${UV_LAYOUT.fieldHeight}px`;
    labelEl.style.textAlign = 'left';
    return labelEl;
  }

  /**
   * Configures a compact number-like text input (supports mixed dash display).
   *
   * @param input Input element.
   * @param step Step size.
   */
  private configureNumberInput(input: HTMLInputElement, step: number): void {
    input.type = 'text';
    input.inputMode = 'decimal';
    input.placeholder = MIXED_VALUE_DISPLAY;
    input.dataset['step'] = String(step);
    input.style.width = `${UV_LAYOUT.fieldWidth}px`;
    input.style.minWidth = `${UV_LAYOUT.fieldWidth}px`;
    input.style.maxWidth = `${UV_LAYOUT.fieldWidth}px`;
    input.style.height = `${UV_LAYOUT.fieldHeight}px`;
    input.style.boxSizing = 'border-box';
    input.style.background = Theme.inputBackgroundColor;
    input.style.color = Theme.inputTextColor;
    input.style.border = `1px solid ${Theme.inputBorderColor}`;
    input.style.borderRadius = '3px';
    input.style.padding = '0 4px';
    input.style.fontFamily = 'monospace';
    input.style.fontSize = '11px';
    input.style.textAlign = 'right';
    this.bindMixedValueFocusClear(input);
  }

  /**
   * Creates a fixed-width nudge button (same size for ×2, ½, −90, +90, etc.).
   *
   * @param label Button label.
   * @param title Tooltip.
   * @param onClick Click handler.
   * @returns Button element.
   */
  private createNudgeButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    this.applyControlButtonChrome(button, UV_LAYOUT.controlHeight);
    button.style.fontSize = '10px';
    button.style.fontFamily = 'monospace';
    button.style.padding = '0';
    button.style.lineHeight = '1';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    this.bindButtonHover(button);
    return button;
  }

  /**
   * Creates a fixed-width icon button for the top strip (same cell as nudges).
   *
   * @param title Tooltip.
   * @param svgIcon SVG markup.
   * @param onClick Click handler.
   * @returns Button element.
   */
  private createIconButton(title: string, svgIcon: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = svgIcon;
    this.applyControlButtonChrome(button, UV_LAYOUT.iconHeight);
    button.style.padding = '0';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    this.bindButtonHover(button);
    return button;
  }

  /**
   * Applies shared fixed size and chrome to toolbar / nudge controls.
   *
   * @param button Button to style.
   * @param height Control height in pixels.
   */
  private applyControlButtonChrome(button: HTMLButtonElement, height: number): void {
    button.style.width = `${UV_LAYOUT.controlWidth}px`;
    button.style.minWidth = `${UV_LAYOUT.controlWidth}px`;
    button.style.maxWidth = `${UV_LAYOUT.controlWidth}px`;
    button.style.height = `${height}px`;
    button.style.boxSizing = 'border-box';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.border = `1px solid ${Theme.inputBorderColor}`;
    button.style.borderRadius = '3px';
    button.style.background = hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.cursor = 'pointer';
    button.style.flex = `0 0 ${UV_LAYOUT.controlWidth}px`;
    button.style.overflow = 'hidden';
  }

  /**
   * Styles a small chrome button (title bar close).
   *
   * @param button Button element.
   */
  private styleChromeButton(button: HTMLButtonElement): void {
    button.style.border = `1px solid ${Theme.inputBorderColor}`;
    button.style.borderRadius = '3px';
    button.style.background = hexToRgb(Theme.buttonBackground);
    button.style.color = Theme.buttonTextColor;
    button.style.fontSize = '11px';
    button.style.padding = '2px 6px';
    button.style.cursor = 'pointer';
  }

  /**
   * Binds hover background for a toolbar-style button.
   *
   * @param button Button element.
   */
  private bindButtonHover(button: HTMLButtonElement): void {
    button.addEventListener('mouseenter', () => {
      button.style.background = hexToRgb(Theme.buttonHoverColor);
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = hexToRgb(Theme.buttonBackground);
    });
  }

  /** Styles the status label under the fields. */
  private styleStatusLabel(): void {
    this.statusLabel.style.padding = `4px ${UV_LAYOUT.panelPaddingX}px 0`;
    this.statusLabel.style.color = Theme.statusBarTextColor;
    this.statusLabel.style.fontFamily = 'monospace';
    this.statusLabel.style.fontSize = '10px';
  }

  /** Binds change events on numeric fields to apply partial TRS. */
  private bindNumericApply(): void {
    const apply = () => this.emitPartialFromFields();
    [this.scaleUInput, this.scaleVInput, this.offsetUInput, this.offsetVInput, this.rotationInput].forEach((input) => {
      input.addEventListener('change', apply);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          (event.target as HTMLInputElement).blur();
          apply();
        }
      });
    });
  }

  /**
   * Clears a mixed-value dash when the user focuses the field so typing
   * replaces it (Unity properties pattern).
   *
   * @param input Field input.
   */
  private bindMixedValueFocusClear(input: HTMLInputElement): void {
    input.addEventListener('focus', () => {
      if (input.value.trim() !== MIXED_VALUE_DISPLAY) return;
      input.value = '';
    });
  }

  /**
   * Reads fields and emits only the axes that have valid numbers so
   * multi-select can set one field without requiring all others.
   */
  private emitPartialFromFields(): void {
    if (this.suppressFieldEmit) return;
    const fields = this.readPartialFieldsFromInputs();
    if (Object.keys(fields).length === 0) return;
    this.handlers.onApplyPartialTrs(fields);
  }

  /**
   * Parses optional numbers from inputs into a partial TRS object.
   *
   * @returns Partial TRS with only valid typed fields.
   */
  private readPartialFieldsFromInputs(): Partial<FaceTextureMappingTrs> {
    const fields: Partial<FaceTextureMappingTrs> = {};
    const scaleU = this.parseOptionalNumber(this.scaleUInput.value);
    const scaleV = this.parseOptionalNumber(this.scaleVInput.value);
    const offsetU = this.parseOptionalNumber(this.offsetUInput.value);
    const offsetV = this.parseOptionalNumber(this.offsetVInput.value);
    const rotationDeg = this.parseOptionalNumber(this.rotationInput.value);
    if (scaleU !== null) fields.scaleU = scaleU;
    if (scaleV !== null) fields.scaleV = scaleV;
    if (offsetU !== null) fields.offsetU = offsetU;
    if (offsetV !== null) fields.offsetV = offsetV;
    if (rotationDeg !== null) fields.rotationDeg = rotationDeg;
    return fields;
  }

  /**
   * Parses an input string into a number, or null when mixed/empty/invalid.
   *
   * @param text Raw input text.
   * @returns Parsed number, or null to leave the field unchanged.
   */
  private parseOptionalNumber(text: string): number | null {
    const trimmed = text.trim();
    if (trimmed === '' || trimmed === MIXED_VALUE_DISPLAY || trimmed === '-') return null;
    const value = parseFloat(trimmed);
    if (isNaN(value)) return null;
    return value;
  }

  /**
   * Writes a shared number or mixed dash into an input.
   *
   * @param input Target input.
   * @param value Shared value or null when mixed.
   * @param decimals Fixed decimal places.
   */
  private writeField(input: HTMLInputElement, value: number | null, decimals: number): void {
    input.value = value === null ? MIXED_VALUE_DISPLAY : value.toFixed(decimals);
  }

  /** Places the panel at the bottom-left of the default anchor (3D viewport). */
  private positionDefault(): void {
    const paddingPx = 8;
    const anchor = this.defaultAnchor ?? this.host;
    const rect = anchor.getBoundingClientRect();
    const bottomInset = window.innerHeight - rect.bottom + paddingPx;
    this.root.style.left = `${rect.left + paddingPx}px`;
    this.root.style.right = 'auto';
    this.root.style.top = 'auto';
    this.root.style.bottom = `${bottomInset}px`;
  }

  /**
   * Enables dragging the panel from the title bar.
   *
   * @param bar Title bar element.
   */
  private bindDrag(bar: HTMLElement): void {
    bar.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement).tagName === 'BUTTON') return;
      this.isDragging = true;
      const rect = this.root.getBoundingClientRect();
      this.dragOffsetX = event.clientX - rect.left;
      this.dragOffsetY = event.clientY - rect.top;
      const onMove = (moveEvent: PointerEvent) => {
        if (!this.isDragging) return;
        this.root.style.left = `${moveEvent.clientX - this.dragOffsetX}px`;
        this.root.style.top = `${moveEvent.clientY - this.dragOffsetY}px`;
        this.root.style.bottom = 'auto';
        this.root.style.right = 'auto';
      };
      const onUp = () => {
        this.isDragging = false;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }
}
