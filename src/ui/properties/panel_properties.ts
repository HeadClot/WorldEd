import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { UndoCommand } from '@/commands/command_undo.js';
import { CommandTransformPositionSet } from '@/transform/commands/command_transform_position_set.js';
import { CommandTransformRotationSet } from '@/transform/commands/command_transform_rotation_set.js';
import { CommandTransformScaleSet } from '@/transform/commands/command_transform_scale_set.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import { filterUnlockedObjects } from '@/utils/object_lock.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import {
  PanelPropertiesSolidBrushSection,
  SolidBrushPropertyHandlers,
} from './panel_properties_solid_brush_section.js';
import { PanelPropertiesColorSession } from './panel_properties_color_session.js';
import {
  panelPropertiesAreObjectPositionsUnchanged,
  panelPropertiesAreObjectRotationsUnchanged,
  panelPropertiesAreObjectScalesUnchanged,
  panelPropertiesAreValuesShared,
  panelPropertiesEulerDegrees,
  panelPropertiesParseOptionalNumber,
} from './panel_properties_numbers.js';

export type { SolidBrushPropertyHandlers };

/** Configuration for a single axis input row in a property section. */
interface AxisInputConfig {
  label: string;
  color: string;
  axis: 'x' | 'y' | 'z';
}

/** Display string for mixed multi-selection values (Unity-style). */
const MIXED_VALUE_DISPLAY = '—';

/**
 * Right-side properties panel with Position, Rotation, Scale, and Material.
 * Supports multi-selection: mixed fields show dashes; edits apply to all
 * selected objects (Unity-style inspector behavior).
 */
export class PanelProperties {
  private container: HTMLElement;
  private theme: typeof Theme;
  private selectionManager: ManagerSelection;
  private boundObjects: THREE.Object3D[];
  private positionInputs: Map<string, HTMLInputElement>;
  private rotationInputs: Map<string, HTMLInputElement>;
  private scaleInputs: Map<string, HTMLInputElement>;
  private colorInput: HTMLInputElement | null;
  private commandStack: CommandStack | null;
  private textureLock: TextureLockSettings | null;
  private isDisposed: boolean;
  private sections: HTMLElement[];
  private inputChangeHandlers: { input: HTMLInputElement; handler: () => void }[];
  private colorSession: PanelPropertiesColorSession;
  private solidBrushSection: PanelPropertiesSolidBrushSection;
  /**
   * Layout callback after inspector transform commands. Must refresh 2D clones,
   * selection outlines, brush hulls, CAD rulers, and gizmo (same contract as
   * undo/redo).
   */
  private afterTransformCommit: ((objects: THREE.Object3D[]) => void) | null;

  /**
   * Creates a new properties panel.
   *
   * @param container The parent DOM element to append the panel into.
   * @param theme The theme containing color definitions.
   * @param selectionManager The selection manager to bind to.
   */
  constructor(container: HTMLElement, theme: typeof Theme, selectionManager: ManagerSelection) {
    this.container = document.createElement('div');
    this.theme = theme;
    this.selectionManager = selectionManager;
    this.boundObjects = [];
    this.positionInputs = new Map();
    this.rotationInputs = new Map();
    this.scaleInputs = new Map();
    this.colorInput = null;
    this.commandStack = null;
    this.textureLock = null;
    this.isDisposed = false;
    this.sections = [];
    this.inputChangeHandlers = [];
    this.colorSession = new PanelPropertiesColorSession();
    this.afterTransformCommit = null;
    this.solidBrushSection = new PanelPropertiesSolidBrushSection(
      this.theme,
      () => this.createSectionContainer(),
      (title) => this.createSectionHeader(title),
      (hex) => this.hexToRgb(hex),
    );
    this.solidBrushSection.setEditableBrushMeshProvider(() =>
      this.getEditableBoundObjects().filter(
        (object): object is THREE.Mesh => object instanceof THREE.Mesh && SolidBrushVisual.isBrushObject(object),
      ),
    );
    this.applyContainerStyles();
    this.createPositionSection();
    this.createRotationSection();
    this.createScaleSection();
    this.createMaterialSection();
    this.mountSolidBrushSection();
    container.appendChild(this.container);
    this.bindSelectionChanges();
  }

  /**
   * Wires solid-brush operation and rebuild handlers from the layout.
   *
   * @param handlers Brush property handlers, or null to clear.
   */
  setSolidBrushHandlers(handlers: SolidBrushPropertyHandlers | null): void {
    this.solidBrushSection.setHandlers(handlers);
  }

  /**
   * Sets the callback invoked after position/rotation/scale commands commit.
   * Layout must refresh multi-viewport visuals here — transforms alone leave
   * clones, outlines, hulls, and CAD rulers desynced.
   *
   * @param callback Receives the objects that were transformed, or null.
   */
  setAfterTransformCommit(callback: ((objects: THREE.Object3D[]) => void) | null): void {
    this.afterTransformCommit = callback;
  }

  /**
   * Sets the command stack for undo/redo support on property edits.
   *
   * @param stack The command stack to use for property changes.
   */
  setCommandStack(stack: CommandStack): void {
    this.commandStack = stack;
    this.colorSession.setCommandStack(stack);
  }

  /**
   * Sets texture lock settings for scale edits from the inspector.
   *
   * @param settings Shared texture lock settings, or null.
   */
  setTextureLockSettings(settings: TextureLockSettings | null): void {
    this.textureLock = settings;
  }

  /**
   * Binds the panel to a single object for editing.
   *
   * @param object The Three.js object to bind to.
   */
  bindObject(object: THREE.Object3D): void {
    this.bindObjects([object]);
  }

  /**
   * Binds the panel to multiple objects for multi-edit.
   *
   * @param objects The objects currently selected.
   */
  bindObjects(objects: THREE.Object3D[]): void {
    this.colorSession.finalize();
    this.boundObjects = objects.slice();
    this.updateFromObjects(this.boundObjects);
  }

  /** Unbinds the panel from any objects and clears inputs. */
  unbindObject(): void {
    this.colorSession.finalize();
    this.boundObjects = [];
    this.clearAllInputs();
    this.solidBrushSection.updateFromObjects([]);
  }

  /**
   * Re-reads transform values from the currently bound objects. Call during
   * gizmo drags so position/rotation/scale inputs stay live.
   */
  refreshBoundObject(): void {
    if (this.isDisposed || this.boundObjects.length === 0) return;
    this.updateFromObjects(this.boundObjects);
  }

  /**
   * Updates all input values from one object (single-selection helper).
   *
   * @param object The Three.js object to read values from.
   */
  updateFromObject(object: THREE.Object3D): void {
    this.updateFromObjects([object]);
  }

  /**
   * Updates inputs from multiple objects, showing dashes for mixed fields.
   *
   * @param objects Objects in the current selection.
   */
  updateFromObjects(objects: THREE.Object3D[]): void {
    if (objects.length === 0) {
      this.clearAllInputs();
      this.solidBrushSection.updateFromObjects([]);
      return;
    }
    this.writeVectorInputs(
      this.positionInputs,
      objects.map((object) => object.position),
      2,
    );
    this.writeVectorInputs(
      this.rotationInputs,
      objects.map((object) => panelPropertiesEulerDegrees(object.rotation)),
      1,
    );
    this.writeVectorInputs(
      this.scaleInputs,
      objects.map((object) => object.scale),
      2,
    );
    this.updateColorFromObjects(objects);
    this.solidBrushSection.updateFromObjects(objects);
  }

  /** Disposes the panel and removes it from the DOM. */
  dispose(): void {
    this.isDisposed = true;
    this.colorSession.finalize();
    this.removeInputChangeListeners();
    this.positionInputs.clear();
    this.rotationInputs.clear();
    this.scaleInputs.clear();
    this.sections = [];
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  /**
   * Returns the container element for layout purposes.
   *
   * @returns The DOM element of the panel.
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Writes shared or mixed axis values into an input map.
   *
   * @param inputMap Axis inputs to update.
   * @param vectors Per-object vector values (position/scale/degrees).
   * @param decimals Fixed decimal places for shared numbers.
   */
  private writeVectorInputs(inputMap: Map<string, HTMLInputElement>, vectors: THREE.Vector3[], decimals: number): void {
    this.writeAxisInput(
      inputMap,
      'x',
      vectors.map((vector) => vector.x),
      decimals,
    );
    this.writeAxisInput(
      inputMap,
      'y',
      vectors.map((vector) => vector.y),
      decimals,
    );
    this.writeAxisInput(
      inputMap,
      'z',
      vectors.map((vector) => vector.z),
      decimals,
    );
  }

  /**
   * Writes one axis field as a shared number or mixed dash.
   *
   * @param inputMap Input map.
   * @param axis Axis key.
   * @param values Per-object values for this axis.
   * @param decimals Decimal places when shared.
   */
  private writeAxisInput(
    inputMap: Map<string, HTMLInputElement>,
    axis: string,
    values: number[],
    decimals: number,
  ): void {
    const input = inputMap.get(axis);
    if (!input) return;
    if (panelPropertiesAreValuesShared(values)) {
      input.value = values[0]!.toFixed(decimals);
      return;
    }
    input.value = MIXED_VALUE_DISPLAY;
  }

  /**
   * Applies position edits from the panel to all bound objects. Only axes with
   * valid numbers are written (mixed axes keep per-object values).
   */
  private applyPositionCommand(): void {
    const editable = this.getEditableBoundObjects();
    if (editable.length === 0) return;
    const x = panelPropertiesParseOptionalNumber(this.positionInputs.get('x')!.value);
    const y = panelPropertiesParseOptionalNumber(this.positionInputs.get('y')!.value);
    const z = panelPropertiesParseOptionalNumber(this.positionInputs.get('z')!.value);
    if (x === null && y === null && z === null) return;
    const positions = editable.map((object) => {
      const next = object.position.clone();
      if (x !== null) next.x = x;
      if (y !== null) next.y = y;
      if (z !== null) next.z = z;
      return next;
    });
    if (panelPropertiesAreObjectPositionsUnchanged(editable, positions)) return;
    this.pushOrExecute(new CommandTransformPositionSet(editable, positions));
    this.applyBoundContentTexturePolicy(true, false);
    this.commitTransformSideEffects(editable);
  }

  /** Applies rotation edits (degrees in the UI) to unlocked bound objects. */
  private applyRotationCommand(): void {
    const editable = this.getEditableBoundObjects();
    if (editable.length === 0) return;
    const x = panelPropertiesParseOptionalNumber(this.rotationInputs.get('x')!.value);
    const y = panelPropertiesParseOptionalNumber(this.rotationInputs.get('y')!.value);
    const z = panelPropertiesParseOptionalNumber(this.rotationInputs.get('z')!.value);
    if (x === null && y === null && z === null) return;
    const rotations = editable.map((object) => {
      const rx = x !== null ? THREE.MathUtils.degToRad(x) : object.rotation.x;
      const ry = y !== null ? THREE.MathUtils.degToRad(y) : object.rotation.y;
      const rz = z !== null ? THREE.MathUtils.degToRad(z) : object.rotation.z;
      return new THREE.Euler(rx, ry, rz, 'XYZ');
    });
    if (panelPropertiesAreObjectRotationsUnchanged(editable, rotations)) return;
    this.pushOrExecute(new CommandTransformRotationSet(editable, rotations));
    this.applyBoundContentTexturePolicy(true, false);
    this.commitTransformSideEffects(editable);
  }

  /** Applies scale edits to unlocked bound objects. */
  private applyScaleCommand(): void {
    const editable = this.getEditableBoundObjects();
    if (editable.length === 0) return;
    const x = panelPropertiesParseOptionalNumber(this.scaleInputs.get('x')!.value);
    const y = panelPropertiesParseOptionalNumber(this.scaleInputs.get('y')!.value);
    const z = panelPropertiesParseOptionalNumber(this.scaleInputs.get('z')!.value);
    if (x === null && y === null && z === null) return;
    const scales = editable.map((object) => {
      const next = object.scale.clone();
      if (x !== null) next.x = x;
      if (y !== null) next.y = y;
      if (z !== null) next.z = z;
      return next;
    });
    if (panelPropertiesAreObjectScalesUnchanged(editable, scales)) return;
    // Heal stale world UV matrices at the pre-scale pose so world-density
    // rebake after CommandTransformSetScale cannot collapse a UV axis.
    this.prepareBoundContentMeshesForTextureOps();
    this.pushOrExecute(new CommandTransformScaleSet(editable, scales));
    this.applyBoundContentTexturePolicy(false, true);
    this.commitTransformSideEffects(editable);
  }

  /**
   * Runs post-transform side effects after an inspector pose write: solid CSG
   * finalize (via layout callback), multi-viewport visual sync, then re-read
   * inputs from the live bound objects.
   *
   * @param objects Objects that received the transform command.
   */
  private commitTransformSideEffects(objects: THREE.Object3D[]): void {
    this.afterTransformCommit?.(objects);
    this.updateFromObjects(this.boundObjects);
  }

  /**
   * Returns bound objects that are not locked for editing.
   *
   * @returns Unlocked bound objects.
   */
  private getEditableBoundObjects(): THREE.Object3D[] {
    return filterUnlockedObjects(this.boundObjects);
  }

  /**
   * Applies content texture lock policy after an inspector pose write.
   *
   * @param moved True when translation/rotation changed.
   * @param scaled True when scale changed.
   */
  private applyBoundContentTexturePolicy(moved: boolean, scaled: boolean): void {
    if (!this.textureLock) return;
    this.textureLock.applyContentTransformPolicy(this.getEditableBoundMeshes(), moved, scaled);
  }

  /**
   * Heals stale content UV matrices on bound meshes before a pose write that
   * may world-rebake (inspector scale).
   */
  private prepareBoundContentMeshesForTextureOps(): void {
    if (!this.textureLock) return;
    this.textureLock.prepareContentMeshesForTextureOps(this.getEditableBoundMeshes());
  }

  /**
   * Returns editable bound objects that are meshes.
   *
   * @returns Content and brush meshes currently bound in the panel.
   */
  private getEditableBoundMeshes(): THREE.Mesh[] {
    return this.getEditableBoundObjects().filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
  }

  /**
   * Pushes a command through the stack, or executes it directly.
   *
   * @param command Undoable command to run.
   */
  private pushOrExecute(command: UndoCommand): void {
    if (this.commandStack) {
      this.commandStack.push(command);
      return;
    }
    command.execute();
  }

  /** Applies styles to the panel container. */
  private applyContainerStyles(): void {
    this.container.classList.add('editor-properties-panel');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.overflow = 'hidden';
    this.container.style.background = this.hexToRgb(Theme.propertiesPanelBackground);
    this.container.style.borderLeft = `2px solid ${this.hexToRgb(Theme.separatorColor)}`;
    this.container.style.width = '200px';
    this.container.style.minWidth = '200px';
    this.container.style.userSelect = 'none';
  }

  /** Creates the Position collapsible section. */
  private createPositionSection(): void {
    const section = this.createSection(
      'Position',
      [
        { label: 'x', axis: 'x', color: this.axisColor(Theme.gizmoXAxisColor) },
        { label: 'y', axis: 'y', color: this.axisColor(Theme.gizmoYAxisColor) },
        { label: 'z', axis: 'z', color: this.axisColor(Theme.gizmoZAxisColor) },
      ],
      this.positionInputs,
    );
    this.sections.push(section);
    this.container.appendChild(section);
  }

  /** Creates the Rotation collapsible section. */
  private createRotationSection(): void {
    const section = this.createSection(
      'Rotation',
      [
        { label: 'x', axis: 'x', color: this.axisColor(Theme.gizmoXAxisColor) },
        { label: 'y', axis: 'y', color: this.axisColor(Theme.gizmoYAxisColor) },
        { label: 'z', axis: 'z', color: this.axisColor(Theme.gizmoZAxisColor) },
      ],
      this.rotationInputs,
    );
    this.sections.push(section);
    this.container.appendChild(section);
  }

  /** Creates the Scale collapsible section. */
  private createScaleSection(): void {
    const section = this.createSection(
      'Scale',
      [
        { label: 'x', axis: 'x', color: this.axisColor(Theme.gizmoXAxisColor) },
        { label: 'y', axis: 'y', color: this.axisColor(Theme.gizmoYAxisColor) },
        { label: 'z', axis: 'z', color: this.axisColor(Theme.gizmoZAxisColor) },
      ],
      this.scaleInputs,
    );
    this.sections.push(section);
    this.container.appendChild(section);
  }

  /**
   * Formats a theme hex color as a CSS #rrggbb string.
   *
   * @param hex Theme color number.
   * @returns CSS color string.
   */
  private axisColor(hex: number): string {
    return '#' + hex.toString(16).padStart(6, '0');
  }

  /** Creates the Material color section for mesh color editing. */
  private createMaterialSection(): void {
    const section = this.createSectionContainer();
    section.appendChild(this.createSectionHeader('Material'));
    const content = document.createElement('div');
    content.style.padding = '6px 8px';
    content.appendChild(this.createColorPickerRow());
    section.appendChild(content);
    this.sections.push(section);
    this.container.appendChild(section);
  }

  /** Mounts the solid brush section into the panel. */
  private mountSolidBrushSection(): void {
    const element = this.solidBrushSection.getElement();
    this.sections.push(element);
    this.container.appendChild(element);
  }

  /**
   * Builds the color label and picker row for the material section.
   *
   * @returns Row element containing the color control.
   */
  private createColorPickerRow(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.appendChild(this.createColorLabel());
    this.colorInput = this.createColorInput();
    row.appendChild(this.colorInput);
    return row;
  }

  /**
   * Creates the "Color" label for the material section.
   *
   * @returns Styled label element.
   */
  private createColorLabel(): HTMLElement {
    const label = document.createElement('span');
    label.textContent = 'Color';
    label.style.color = this.theme.buttonTextColor;
    label.style.fontFamily = 'monospace';
    label.style.fontSize = '12px';
    return label;
  }

  /**
   * Creates the color input and binds edit/finalize listeners.
   *
   * @returns Configured color input element.
   */
  private createColorInput(): HTMLInputElement {
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#ffffff';
    colorInput.style.width = '48px';
    colorInput.style.height = '24px';
    colorInput.style.border = 'none';
    colorInput.style.background = 'transparent';
    colorInput.style.cursor = 'pointer';
    colorInput.addEventListener('input', () => this.onColorPickerValueEdited());
    colorInput.addEventListener('change', () => this.onColorPickerValueEdited());
    colorInput.addEventListener('blur', () => this.colorSession.finalize());
    return colorInput;
  }

  /**
   * Updates the color picker from selected mesh materials.
   *
   * @param objects Selected objects.
   */
  private updateColorFromObjects(objects: THREE.Object3D[]): void {
    if (!this.colorInput) return;
    const colors = this.collectMeshColors(objects);
    if (colors.length === 0) {
      this.colorInput.value = '#ffffff';
      this.colorInput.style.opacity = '1';
      return;
    }
    if (this.areColorsShared(colors)) {
      this.colorInput.value = `#${colors[0]!.toString(16).padStart(6, '0')}`;
      this.colorInput.style.opacity = '1';
      return;
    }
    this.colorInput.value = '#ffffff';
    this.colorInput.style.opacity = '0.55';
  }

  /**
   * Collects material color hex values from mesh objects.
   *
   * @param objects Selected objects.
   * @returns Color hex list.
   */
  private collectMeshColors(objects: THREE.Object3D[]): number[] {
    const colors: number[] = [];
    objects.forEach((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material;
      if (!material || Array.isArray(material) || !('color' in material)) return;
      colors.push((material as THREE.MeshStandardMaterial).color.getHex());
    });
    return colors;
  }

  /**
   * Returns whether all colors are identical.
   *
   * @param colors Hex colors.
   * @returns True when shared.
   */
  private areColorsShared(colors: number[]): boolean {
    if (colors.length === 0) return true;
    return colors.every((color) => color === colors[0]);
  }

  /** Applies a color picker value with a single coalesced undo command. */
  private onColorPickerValueEdited(): void {
    if (!this.colorInput || this.boundObjects.length === 0) return;
    const colorHex = this.parseColorInputHex(this.colorInput.value);
    if (colorHex === null) return;
    this.colorSession.onColorEdited(colorHex, this.collectColorEditableMeshes(this.getEditableBoundObjects()));
    this.colorInput.style.opacity = '1';
  }

  /**
   * Parses a CSS #rrggbb color string into a hex number.
   *
   * @param value The color input value (e.g. "#ff0000").
   * @returns Hex number, or null when invalid.
   */
  private parseColorInputHex(value: string): number | null {
    const trimmed = value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return null;
    return parseInt(trimmed.slice(1), 16);
  }

  /**
   * Collects bound meshes that expose a writable material color.
   *
   * @param objects Selected objects.
   * @returns Editable meshes.
   */
  private collectColorEditableMeshes(objects: THREE.Object3D[]): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    objects.forEach((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const material = object.material;
      if (!material || Array.isArray(material) || !('color' in material)) return;
      meshes.push(object);
    });
    return meshes;
  }

  /**
   * Creates a collapsible section with axis inputs.
   *
   * @param title The section title.
   * @param axes The axis configuration for each row.
   * @param inputMap The map to store input references.
   * @returns The created section element.
   */
  private createSection(title: string, axes: AxisInputConfig[], inputMap: Map<string, HTMLInputElement>): HTMLElement {
    const section = this.createSectionContainer();
    const header = this.createSectionHeader(title);
    section.appendChild(header);
    const content = this.createSectionContent(axes, inputMap);
    section.appendChild(content);
    this.bindSectionToggle(header, content);
    return section;
  }

  /**
   * Creates the outer container element for a section.
   *
   * @returns The styled section container element.
   */
  private createSectionContainer(): HTMLElement {
    const section = document.createElement('div');
    section.style.padding = '8px';
    section.style.borderBottom = `1px solid ${this.hexToRgb(Theme.separatorColor)}`;
    return section;
  }

  /**
   * Creates the clickable header element for a section.
   *
   * @param title The text to display in the header.
   * @returns The styled header element.
   */
  private createSectionHeader(title: string): HTMLElement {
    const header = document.createElement('div');
    header.textContent = title;
    header.style.fontWeight = 'bold';
    header.style.fontSize = '11px';
    header.style.fontFamily = 'monospace';
    header.style.color = Theme.buttonTextColor;
    header.style.marginBottom = '6px';
    header.style.cursor = 'pointer';
    return header;
  }

  /**
   * Creates the content container with axis input rows.
   *
   * @param axes The axis configuration for each row.
   * @param inputMap The map to store input references.
   * @returns The styled content element.
   */
  private createSectionContent(axes: AxisInputConfig[], inputMap: Map<string, HTMLInputElement>): HTMLElement {
    const content = document.createElement('div');
    content.style.paddingLeft = '4px';
    axes.forEach((axisConfig) => {
      const row = this.createAxisRow(axisConfig.label.toUpperCase(), axisConfig.color, axisConfig.axis, inputMap);
      content.appendChild(row);
    });
    return content;
  }

  /**
   * Creates a single axis input row with label and number input.
   *
   * @param label The axis label (X, Y, Z).
   * @param color The label color.
   * @param axis The axis identifier.
   * @param inputMap The map to store the input reference.
   * @returns The row element.
   */
  private createAxisRow(
    label: string,
    color: string,
    axis: string,
    inputMap: Map<string, HTMLInputElement>,
  ): HTMLElement {
    const row = this.createAxisRowContainer();
    const labelEl = this.createAxisLabel(label, color);
    const input = this.createAxisInput(axis, inputMap);
    row.appendChild(labelEl);
    row.appendChild(input);
    return row;
  }

  /**
   * Creates the container element for an axis row.
   *
   * @returns The styled row container.
   */
  private createAxisRowContainer(): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '4px';
    row.style.marginBottom = '2px';
    return row;
  }

  /**
   * Creates the axis label span element.
   *
   * @param label The axis label text.
   * @param color The label text color.
   * @returns The styled label element.
   */
  private createAxisLabel(label: string, color: string): HTMLElement {
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    labelEl.style.color = color;
    labelEl.style.fontSize = '11px';
    labelEl.style.fontFamily = 'monospace';
    labelEl.style.width = '12px';
    return labelEl;
  }

  /**
   * Creates the text input element for an axis (supports mixed "—" display).
   *
   * @param axis The axis identifier.
   * @param inputMap The map to store the input reference.
   * @returns The styled input element.
   */
  private createAxisInput(axis: string, inputMap: Map<string, HTMLInputElement>): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.placeholder = MIXED_VALUE_DISPLAY;
    input.style.width = '100%';
    input.style.padding = '2px 4px';
    input.style.background = Theme.inputBackgroundColor;
    input.style.color = Theme.inputTextColor;
    input.style.border = `1px solid ${Theme.inputBorderColor}`;
    input.style.borderRadius = '2px';
    input.style.fontSize = '11px';
    input.style.fontFamily = 'monospace';
    inputMap.set(axis, input);
    this.bindInputToChanges(input, inputMap);
    this.bindMixedValueFocusClear(input);
    return input;
  }

  /**
   * Clears a mixed-value dash when the user focuses the field so typing
   * replaces it.
   *
   * @param input Axis input element.
   */
  private bindMixedValueFocusClear(input: HTMLInputElement): void {
    const handleFocus = () => {
      if (input.value.trim() !== MIXED_VALUE_DISPLAY) return;
      input.value = '';
    };
    input.addEventListener('focus', handleFocus);
    this.inputChangeHandlers.push({ input, handler: handleFocus });
  }

  /**
   * Binds an input element to apply multi-object changes on commit.
   *
   * @param input The input element.
   * @param inputMap The input map this belongs to.
   */
  private bindInputToChanges(input: HTMLInputElement, inputMap: Map<string, HTMLInputElement>): void {
    const handleChange = () => {
      if (this.boundObjects.length === 0) return;
      if (inputMap === this.positionInputs) this.applyPositionCommand();
      if (inputMap === this.rotationInputs) this.applyRotationCommand();
      if (inputMap === this.scaleInputs) this.applyScaleCommand();
    };
    input.addEventListener('change', handleChange);
    this.inputChangeHandlers.push({ input, handler: handleChange });
  }

  /** Removes all change and focus listeners from axis input elements. */
  private removeInputChangeListeners(): void {
    this.inputChangeHandlers.forEach(({ input, handler }) => {
      input.removeEventListener('change', handler);
      input.removeEventListener('focus', handler);
    });
    this.inputChangeHandlers = [];
  }

  /** Binds selection change events to update the panel for multi-select. */
  private bindSelectionChanges(): void {
    this.selectionManager.onSelectionChanged(() => {
      if (this.isDisposed) return;
      const selected = this.selectionManager.getInspectorObjects();
      if (selected.length > 0) {
        this.bindObjects(selected);
        return;
      }
      this.unbindObject();
    });
  }

  /** Clears all input values to empty strings. */
  private clearAllInputs(): void {
    this.positionInputs.forEach((input) => {
      input.value = '';
    });
    this.rotationInputs.forEach((input) => {
      input.value = '';
    });
    this.scaleInputs.forEach((input) => {
      input.value = '';
    });
    if (this.colorInput) {
      this.colorInput.value = '#ffffff';
      this.colorInput.style.opacity = '1';
    }
  }

  /**
   * Toggles section visibility on header click.
   *
   * @param header The header element.
   * @param content The content element to toggle.
   */
  private bindSectionToggle(header: HTMLElement, content: HTMLElement): void {
    let collapsed = false;
    header.addEventListener('click', () => {
      collapsed = !collapsed;
      content.style.display = collapsed ? 'none' : 'block';
    });
  }

  /**
   * Converts a hex color number to an RGB CSS string.
   *
   * @param hex The hex color value.
   * @returns An RGB CSS color string.
   */
  private hexToRgb(hex: number): string {
    const r = (hex >> 16) & 255;
    const g = (hex >> 8) & 255;
    const b = hex & 255;
    return `rgb(${r}, ${g}, ${b})`;
  }
}
