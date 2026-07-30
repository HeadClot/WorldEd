import * as THREE from 'three';
import { ManagerInput } from '@/input/manager_input.js';
import {
  getDefaultFrontCameraPosition,
  getDefaultSideCameraPosition,
  getDefaultTopCameraPosition,
} from '@/navigation/placement/default_camera_placement.js';
import { Viewport2D } from './viewport_2d.js';
import { Viewport3D } from './viewport_3d.js';
import {
  ViewportKind,
  getViewportKindDisplayLabel,
  getViewportKindMetadata,
  isPerspectiveViewportKind,
} from './viewport_kind.js';
import type { ViewportEditor } from './viewport_editor.js';
import type { SharedWebGLSurface } from '@/viewports/shared/shared_webgl_surface.js';

/** Dependencies required to construct any viewport kind. */
export interface ViewportFactoryDependencies {
  inputManager: ManagerInput;
  sharedScene: THREE.Scene;
  surface: SharedWebGLSurface;
}

/**
 * Creates a live viewport instance for the given kind inside a pane container.
 *
 * @param kind Viewport kind to instantiate.
 * @param container DOM element that hosts chrome for this pane.
 * @param dependencies Shared construction dependencies.
 * @returns Configured 2D or 3D viewport with kind assigned.
 */
export function createViewportForKind(
  kind: ViewportKind,
  container: HTMLElement,
  dependencies: ViewportFactoryDependencies,
): ViewportEditor {
  const contentElement = ensureContentElement(container);
  if (isPerspectiveViewportKind(kind)) {
    const viewport = new Viewport3D({
      container,
      contentElement,
      name: getViewportKindDisplayLabel(kind),
      sharedScene: dependencies.sharedScene,
      surface: dependencies.surface,
      inputManager: dependencies.inputManager,
    });
    viewport.setViewportKind(kind);
    return viewport;
  }
  return createOrthographicViewport(kind, container, contentElement, dependencies);
}

/**
 * Builds an orthographic viewport for top, front, or side.
 *
 * @param kind Orthographic viewport kind.
 * @param container Host DOM container.
 * @param contentElement Content hit target.
 * @param dependencies Shared factory dependencies.
 * @returns Configured Viewport2D.
 */
function createOrthographicViewport(
  kind: ViewportKind,
  container: HTMLElement,
  contentElement: HTMLElement,
  dependencies: ViewportFactoryDependencies,
): Viewport2D {
  const metadata = getViewportKindMetadata(kind);
  const label = getViewportKindDisplayLabel(kind);
  const cameraPosition = resolveDefaultOrthoCameraPosition(kind);
  const viewport = new Viewport2D({
    container,
    contentElement,
    name: label,
    sharedScene: dependencies.sharedScene,
    surface: dependencies.surface,
    plane: metadata.gridPlane,
    cameraPosition,
  });
  viewport.setViewportKind(kind);
  return viewport;
}

/**
 * Ensures a pane has a content element below the toolbar for picking/scissor.
 *
 * @param container Pane container.
 * @returns Content element.
 */
function ensureContentElement(container: HTMLElement): HTMLElement {
  const existing = container.querySelector('.editor-viewport-content') as HTMLElement | null;
  if (existing) return existing;
  const ownerDocument = container.ownerDocument;
  const content = ownerDocument.createElement('div');
  content.classList.add('editor-viewport-content');
  content.style.flex = '1';
  content.style.minHeight = '0';
  content.style.position = 'relative';
  container.appendChild(content);
  return content;
}

/**
 * Resolves the default orthographic camera position for a kind.
 *
 * @param kind Orthographic kind.
 * @returns Default world-space camera position.
 */
function resolveDefaultOrthoCameraPosition(kind: ViewportKind): THREE.Vector3 {
  if (kind === ViewportKind.TOP) return getDefaultTopCameraPosition();
  if (kind === ViewportKind.FRONT) return getDefaultFrontCameraPosition();
  return getDefaultSideCameraPosition();
}
