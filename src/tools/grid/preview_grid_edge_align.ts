import * as THREE from 'three';
import { Theme } from '@/theme.js';
import type { EditorOrientationWorldBasis } from '@/navigation/orientation/editor_orientation_edge_align.js';
import type { EditorOrientationAxisId } from '@/navigation/orientation/editor_orientation_axis.js';
import { computeViewportConstantScreenScale } from '@/viewports/scale/viewport_constant_screen_scale.js';

/** Local unit length of each preview axis arrow (scaled by camera distance). */
const PREVIEW_ARROW_LOCAL_LENGTH = 1.25;

/** Arrow head length relative to shaft in local units. */
const PREVIEW_HEAD_LENGTH = 0.28;

/** Arrow head width relative to shaft in local units. */
const PREVIEW_HEAD_WIDTH = 0.16;

/**
 * Non-picking world-space XYZ triad preview for grid edge-align hover. Uses the
 * same X red / Y green / Z blue language as the viewport corner camera widget.
 * Arrow size tracks transform gizmos via constant on-screen scale; the edge
 * construction line stays true world length.
 */
export class PreviewGridEdgeAlign {
  private readonly scene: THREE.Scene;
  private readonly group: THREE.Group;
  private readonly arrowRoot: THREE.Group;
  private readonly arrowX: THREE.ArrowHelper;
  private readonly arrowY: THREE.ArrowHelper;
  private readonly arrowZ: THREE.ArrowHelper;
  private readonly edgeLine: THREE.Line;
  private visible: boolean;
  private scaleCamera: THREE.Camera | null;

  /**
   * Creates a triad preview parented to the given scene.
   *
   * @param scene Scene that receives the preview group.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'preview_grid_edge_align';
    this.group.visible = false;
    this.arrowRoot = new THREE.Group();
    this.arrowRoot.name = 'preview_grid_edge_align_arrows';
    this.arrowX = this.buildArrow(new THREE.Vector3(1, 0, 0), Theme.widgetXAxisColor);
    this.arrowY = this.buildArrow(new THREE.Vector3(0, 1, 0), Theme.widgetYAxisColor);
    this.arrowZ = this.buildArrow(new THREE.Vector3(0, 0, 1), Theme.widgetZAxisColor);
    this.edgeLine = this.buildEdgeLine();
    this.arrowRoot.add(this.arrowX, this.arrowY, this.arrowZ);
    this.group.add(this.arrowRoot, this.edgeLine);
    this.disableRaycastOnGroup();
    this.scene.add(this.group);
    this.visible = false;
    this.scaleCamera = null;
  }

  /**
   * Shows the proposed working-frame triad at the cursor-nearest edge point.
   *
   * @param origin World position for the triad origin.
   * @param basis Proposed working-frame basis.
   * @param edgePointA Edge start for the construction line.
   * @param edgePointB Edge end for the construction line.
   * @param highlightAxis Axis being assigned (brighter).
   * @param camera Active viewport camera for constant on-screen scale.
   */
  setPreview(
    origin: THREE.Vector3,
    basis: EditorOrientationWorldBasis,
    edgePointA: THREE.Vector3,
    edgePointB: THREE.Vector3,
    highlightAxis: EditorOrientationAxisId,
    camera: THREE.Camera,
  ): void {
    this.group.position.copy(origin);
    this.scaleCamera = camera;
    this.applyConstantScreenScale(camera, origin);
    this.applyArrowDirection(this.arrowX, basis.xAxis);
    this.applyArrowDirection(this.arrowY, basis.yAxis);
    this.applyArrowDirection(this.arrowZ, basis.zAxis);
    this.updateEdgeLine(edgePointA, edgePointB);
    this.applyAxisHighlight(highlightAxis);
    this.group.visible = true;
    this.visible = true;
  }

  /**
   * Refreshes arrow scale from the last hover camera. Call every frame while
   * visible so fly/zoom updates size without requiring pointer motion.
   */
  updateScreenScale(): void {
    if (!this.visible || !this.scaleCamera) {
      return;
    }
    this.applyConstantScreenScale(this.scaleCamera, this.group.position);
  }

  /** Hides the preview triad. */
  clearPreview(): void {
    if (!this.visible) {
      return;
    }
    this.group.visible = false;
    this.visible = false;
    this.scaleCamera = null;
  }

  /** Removes the group from the scene and disposes materials. */
  dispose(): void {
    this.clearPreview();
    this.scene.remove(this.group);
    this.arrowRoot.remove(this.arrowX, this.arrowY, this.arrowZ);
    this.group.remove(this.arrowRoot, this.edgeLine);
    this.disposeArrowMaterials(this.arrowX);
    this.disposeArrowMaterials(this.arrowY);
    this.disposeArrowMaterials(this.arrowZ);
    const edgeMaterial = this.edgeLine.material;
    if (!Array.isArray(edgeMaterial)) {
      edgeMaterial.dispose();
    }
    this.edgeLine.geometry.dispose();
  }

  /**
   * Scales the arrow root so unit arrows match gizmo on-screen size.
   *
   * @param camera Active viewport camera.
   * @param origin World triad origin.
   */
  private applyConstantScreenScale(camera: THREE.Camera, origin: THREE.Vector3): void {
    const scale = computeViewportConstantScreenScale(camera, origin);
    this.arrowRoot.scale.setScalar(scale);
  }

  /**
   * Builds one axis arrow helper.
   *
   * @param direction Initial unit direction.
   * @param color Hex color.
   * @returns Configured arrow.
   */
  private buildArrow(direction: THREE.Vector3, color: number): THREE.ArrowHelper {
    return new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(0, 0, 0),
      PREVIEW_ARROW_LOCAL_LENGTH,
      color,
      PREVIEW_HEAD_LENGTH,
      PREVIEW_HEAD_WIDTH,
    );
  }

  /**
   * Builds the thin construction line along the hovered edge.
   *
   * @returns Line object parented under the unscaled root.
   */
  private buildEdgeLine(): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)]);
    const material = new THREE.LineBasicMaterial({
      color: Theme.selectionColor,
      depthTest: true,
      transparent: true,
      opacity: 0.9,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 10;
    return line;
  }

  /**
   * Sets arrow direction without allocating a new helper.
   *
   * @param arrow Target arrow.
   * @param direction Unit world direction.
   */
  private applyArrowDirection(arrow: THREE.ArrowHelper, direction: THREE.Vector3): void {
    const length = direction.length();
    if (length < 1e-12) {
      return;
    }
    arrow.setDirection(direction.clone().normalize());
    arrow.setLength(PREVIEW_ARROW_LOCAL_LENGTH, PREVIEW_HEAD_LENGTH, PREVIEW_HEAD_WIDTH);
  }

  /**
   * Writes the edge endpoints into the construction line in group-local space
   * (unscaled so the line keeps true world length).
   *
   * @param edgePointA World edge start.
   * @param edgePointB World edge end.
   */
  private updateEdgeLine(edgePointA: THREE.Vector3, edgePointB: THREE.Vector3): void {
    const localA = edgePointA.clone().sub(this.group.position);
    const localB = edgePointB.clone().sub(this.group.position);
    const positions = this.edgeLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, localA.x, localA.y, localA.z);
    positions.setXYZ(1, localB.x, localB.y, localB.z);
    positions.needsUpdate = true;
    this.edgeLine.geometry.computeBoundingSphere();
  }

  /**
   * Brightens the tool axis and dims the other two slightly.
   *
   * @param highlightAxis Axis being assigned.
   */
  private applyAxisHighlight(highlightAxis: EditorOrientationAxisId): void {
    this.setArrowOpacity(this.arrowX, highlightAxis === 'x' ? 1 : 0.45);
    this.setArrowOpacity(this.arrowY, highlightAxis === 'y' ? 1 : 0.45);
    this.setArrowOpacity(this.arrowZ, highlightAxis === 'z' ? 1 : 0.45);
  }

  /**
   * Sets line and cone material opacity on one arrow.
   *
   * @param arrow Target arrow.
   * @param opacity Opacity 0..1.
   */
  private setArrowOpacity(arrow: THREE.ArrowHelper, opacity: number): void {
    this.setMaterialOpacity(arrow.line.material, opacity);
    this.setMaterialOpacity(arrow.cone.material, opacity);
  }

  /**
   * Applies opacity to a material when it supports transparency.
   *
   * @param material Line or mesh material.
   * @param opacity Opacity 0..1.
   */
  private setMaterialOpacity(material: THREE.Material | THREE.Material[], opacity: number): void {
    if (Array.isArray(material)) {
      material.forEach((entry) => this.setMaterialOpacity(entry, opacity));
      return;
    }
    material.transparent = opacity < 1;
    material.opacity = opacity;
    material.depthTest = true;
  }

  /** Disables raycasting on the entire preview so picks pass through. */
  private disableRaycastOnGroup(): void {
    this.group.traverse((object) => {
      object.raycast = () => undefined;
    });
  }

  /**
   * Disposes materials owned by one arrow helper.
   *
   * @param arrow Axis arrow.
   */
  private disposeArrowMaterials(arrow: THREE.ArrowHelper): void {
    const lineMaterial = arrow.line.material;
    const coneMaterial = arrow.cone.material;
    if (!Array.isArray(lineMaterial)) {
      lineMaterial.dispose();
    }
    if (!Array.isArray(coneMaterial)) {
      coneMaterial.dispose();
    }
  }
}
