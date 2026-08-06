import * as THREE from 'three';
import { EDIT_CAGE_VERTEX_POINT_SIZE } from '@/edit/component/component_edit_cage_overlay.js';
import { EDIT_SELECTED_VERTEX_COLOR } from '@/edit/component/component_edit_selection_draw.js';

/** Draw order above content so the hover vertex stays readable. */
const VERTEX_ORIGIN_RENDER_ORDER = 1010;

/**
 * Non-picking vertex hover marker for grid origin zeroing. Uses the same
 * screen-pixel point size as Edit Mode selected vertices.
 */
export class PreviewGridVertexOrigin {
  private readonly scene: THREE.Scene;
  private readonly marker: THREE.Points;
  private visible: boolean;

  /**
   * Creates a vertex origin preview parented to the given scene.
   *
   * @param scene Scene that receives the marker.
   */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.marker = this.buildMarker();
    this.marker.visible = false;
    this.marker.raycast = () => undefined;
    this.scene.add(this.marker);
    this.visible = false;
  }

  /**
   * Shows the marker at a world vertex position.
   *
   * @param worldPoint World position of the hovered vertex.
   */
  setHoverPoint(worldPoint: THREE.Vector3): void {
    this.writeMarkerPosition(worldPoint);
    this.marker.visible = true;
    this.visible = true;
  }

  /** Hides the hover marker. */
  clearHover(): void {
    if (!this.visible) {
      return;
    }
    this.marker.visible = false;
    this.visible = false;
  }

  /** Removes the marker from the scene and disposes resources. */
  dispose(): void {
    this.clearHover();
    this.scene.remove(this.marker);
    this.marker.geometry.dispose();
    const material = this.marker.material;
    if (!Array.isArray(material)) {
      material.dispose();
    }
  }

  /**
   * Builds a single-point marker matching Edit Mode vertex dot size.
   *
   * @returns Configured points object.
   */
  private buildMarker(): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const material = new THREE.PointsMaterial({
      color: EDIT_SELECTED_VERTEX_COLOR,
      size: EDIT_CAGE_VERTEX_POINT_SIZE,
      sizeAttenuation: false,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 1,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'preview_grid_vertex_origin';
    points.renderOrder = VERTEX_ORIGIN_RENDER_ORDER;
    points.frustumCulled = false;
    return points;
  }

  /**
   * Writes the hover world position into the points buffer.
   *
   * @param worldPoint World vertex position.
   */
  private writeMarkerPosition(worldPoint: THREE.Vector3): void {
    const position = this.marker.geometry.getAttribute('position') as THREE.BufferAttribute;
    position.setXYZ(0, worldPoint.x, worldPoint.y, worldPoint.z);
    position.needsUpdate = true;
    this.marker.geometry.computeBoundingSphere();
  }
}
