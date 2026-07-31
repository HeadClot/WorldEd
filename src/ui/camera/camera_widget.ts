import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { isDrawableRect, type PaneLogicalRect } from '@/viewports/pane/pane_content_rect.js';
import { computeCameraWidgetLogicalRect } from './camera_widget_layout.js';
import { ViewportPresentationContext } from '@/viewports/presentation/viewport_presentation_context.js';

/**
 * Camera orientation gizmo (X=red, Y=green, Z=blue) drawn through the shared
 * multi-view WebGL renderer. Owns only a tiny private scene and orthographic
 * camera — never allocates its own renderer or WebGL context.
 */
export class CameraWidget {
  private widgetCamera: THREE.OrthographicCamera;
  private widgetScene: THREE.Scene;
  private arrowGroup: THREE.Group;
  private arrowX: THREE.ArrowHelper;
  private arrowY: THREE.ArrowHelper;
  private arrowZ: THREE.ArrowHelper;
  private labelGroup: THREE.Group;
  private labelSprites: THREE.Sprite[];
  private readonly scratchQuaternion: THREE.Quaternion;
  private readonly arrowLength: number;
  private readonly headLength: number;
  private readonly headWidth: number;

  /** Creates the orientation arrows and private orthographic camera. */
  constructor() {
    this.arrowLength = 1.2;
    this.headLength = 0.35;
    this.headWidth = 0.2;
    this.scratchQuaternion = new THREE.Quaternion();
    this.widgetScene = new THREE.Scene();
    this.widgetCamera = this.createWidgetCamera();
    this.arrowGroup = new THREE.Group();
    this.widgetScene.add(this.arrowGroup);
    this.arrowX = this.buildArrow(new THREE.Vector3(1, 0, 0), Theme.widgetXAxisColor);
    this.arrowY = this.buildArrow(new THREE.Vector3(0, 1, 0), Theme.widgetYAxisColor);
    this.arrowZ = this.buildArrow(new THREE.Vector3(0, 0, 1), Theme.widgetZAxisColor);
    this.arrowGroup.add(this.arrowX, this.arrowY, this.arrowZ);
    this.labelGroup = new THREE.Group();
    this.labelSprites = [];
    this.widgetScene.add(this.labelGroup);
    this.setPresentationContext(new ViewportPresentationContext());
  }

  /**
   * Builds the fixed orthographic camera that frames the axis arrows.
   *
   * @returns Configured orthographic camera.
   */
  private createWidgetCamera(): THREE.OrthographicCamera {
    const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    return camera;
  }

  /**
   * Builds an ArrowHelper with consistent sizing for one axis.
   *
   * @param direction The axis direction for the arrow.
   * @param color The hex color for the arrow shaft and head.
   * @returns A configured ArrowHelper instance.
   */
  private buildArrow(direction: THREE.Vector3, color: number): THREE.ArrowHelper {
    return new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(0, 0, 0),
      this.arrowLength,
      color,
      this.headLength,
      this.headWidth,
    );
  }

  /** Applies profile-relative directions and labels to the widget arrows. */
  setPresentationContext(context: ViewportPresentationContext): void {
    this.arrowX.setDirection(context.getEditorRight());
    this.arrowY.setDirection(context.getEditorUp());
    this.arrowZ.setDirection(context.getEditorForward());
    this.replaceAxisLabels(context);
  }

  /** Returns the current semantic labels shown by the widget. */
  getAxisLabels(context: ViewportPresentationContext): { right: string; up: string; forward: string } {
    return {
      right: context.getAxisLabel('right'),
      up: context.getAxisLabel('up'),
      forward: context.getAxisLabel('forward'),
    };
  }

  /** Replaces the three profile-aware axis label sprites. */
  private replaceAxisLabels(context: ViewportPresentationContext): void {
    this.disposeAxisLabels();
    const labels = this.getAxisLabels(context);
    this.addAxisLabel(labels.right, context.getEditorRight(), Theme.widgetXAxisColor);
    this.addAxisLabel(labels.up, context.getEditorUp(), Theme.widgetYAxisColor);
    this.addAxisLabel(labels.forward, context.getEditorForward(), Theme.widgetZAxisColor);
  }

  /** Adds one camera-facing profile axis label when canvas text is available. */
  private addAxisLabel(label: string, direction: THREE.Vector3, color: number): void {
    const sprite = this.createAxisLabelSprite(label, color);
    if (!sprite) return;
    sprite.position.copy(direction).multiplyScalar(1.45);
    this.labelGroup.add(sprite);
    this.labelSprites.push(sprite);
  }

  /** Creates a text sprite without allocating a renderer or canvas in tests. */
  private createAxisLabelSprite(label: string, color: number): THREE.Sprite | null {
    const ownerDocument = typeof document === 'undefined' ? null : document;
    if (!ownerDocument) return null;
    const canvas = ownerDocument.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = 'bold 32px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.fillText(label, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.55, 0.275, 1);
    return sprite;
  }

  /** Releases all current label sprites and their canvas resources. */
  private disposeAxisLabels(): void {
    this.labelSprites.forEach((sprite) => {
      const material = sprite.material;
      if (material instanceof THREE.SpriteMaterial) {
        material.map?.dispose();
        material.dispose();
      }
      this.labelGroup.remove(sprite);
    });
    this.labelSprites = [];
  }

  /**
   * Mirrors the main camera orientation onto the arrow group so the gizmo
   * matches the viewport view.
   *
   * @param camera The main viewport camera to mirror.
   */
  syncOrientation(camera: THREE.Camera): void {
    camera.getWorldQuaternion(this.scratchQuaternion);
    this.arrowGroup.quaternion.copy(this.scratchQuaternion).invert();
    this.labelGroup.quaternion.copy(this.arrowGroup.quaternion);
  }

  /**
   * Draws the orientation arrows into the top-right corner of a pane using the
   * shared multi-view WebGL renderer. Clears only depth so the 3D scene remains
   * visible underneath the transparent gizmo.
   *
   * @param renderer Shared workspace (or detached) WebGL renderer.
   * @param paneLogicalRect Logical scissor rect of the perspective pane
   *   content.
   */
  renderOverlay(renderer: THREE.WebGLRenderer, paneLogicalRect: PaneLogicalRect): void {
    const widgetRect = computeCameraWidgetLogicalRect(paneLogicalRect);
    if (!widgetRect || !isDrawableRect(widgetRect)) return;
    renderer.setViewport(widgetRect.x, widgetRect.y, widgetRect.width, widgetRect.height);
    renderer.setScissor(widgetRect.x, widgetRect.y, widgetRect.width, widgetRect.height);
    renderer.clearDepth();
    renderer.render(this.widgetScene, this.widgetCamera);
  }

  /**
   * Returns the private Three.js scene that holds the axis arrows.
   *
   * @returns The widget scene.
   */
  getScene(): THREE.Scene {
    return this.widgetScene;
  }

  /**
   * Returns the private orthographic camera used to frame the arrows.
   *
   * @returns The widget orthographic camera.
   */
  getCamera(): THREE.OrthographicCamera {
    return this.widgetCamera;
  }

  /**
   * Returns the group whose quaternion mirrors the viewport camera.
   *
   * @returns The arrow root group.
   */
  getArrowGroup(): THREE.Group {
    return this.arrowGroup;
  }

  /**
   * Returns the X axis arrow helper.
   *
   * @returns The red (X) ArrowHelper.
   */
  getArrowX(): THREE.ArrowHelper {
    return this.arrowX;
  }

  /**
   * Returns the Y axis arrow helper.
   *
   * @returns The green (Y) ArrowHelper.
   */
  getArrowY(): THREE.ArrowHelper {
    return this.arrowY;
  }

  /**
   * Returns the Z axis arrow helper.
   *
   * @returns The blue (Z) ArrowHelper.
   */
  getArrowZ(): THREE.ArrowHelper {
    return this.arrowZ;
  }

  /**
   * Releases per-arrow materials. Geometry is intentionally kept: Three.js
   * shares ArrowHelper line/cone buffers across all instances.
   */
  dispose(): void {
    this.arrowGroup.remove(this.arrowX, this.arrowY, this.arrowZ);
    this.disposeAxisLabels();
    this.widgetScene.remove(this.labelGroup);
    this.disposeArrowMaterials(this.arrowX);
    this.disposeArrowMaterials(this.arrowY);
    this.disposeArrowMaterials(this.arrowZ);
  }

  /**
   * Disposes materials owned by one axis arrow (not shared geometries).
   *
   * @param arrow Axis arrow whose materials should be freed.
   */
  private disposeArrowMaterials(arrow: THREE.ArrowHelper): void {
    const lineMaterial = arrow.line.material;
    const coneMaterial = arrow.cone.material;
    if (!Array.isArray(lineMaterial)) lineMaterial.dispose();
    if (!Array.isArray(coneMaterial)) coneMaterial.dispose();
  }
}
