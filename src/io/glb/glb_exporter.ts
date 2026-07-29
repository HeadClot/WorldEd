import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildExportScene } from '../export_scene_builder.js';
import type { GameProfile } from '../../settings/settings_types.js';
import { buildExportRootTransform } from '../coordinate_space_transform.js';

/**
 * Exports a Three.js scene group to binary GLB format. Filters out solid brush
 * helpers, selection overlays, and other editor internals so the file contains
 * only final content geometry. When a profile is supplied, its unit scale and
 * coordinate space conversion are applied to a temporary export root before
 * invoking GLTFExporter.
 */
export class GlbExporter {
  /**
   * Exports the given group to a GLB binary buffer.
   *
   * @param worldGroup The live editor world root to export.
   * @param profile Active game profile, or null to skip the conversion.
   * @returns A promise resolving to the GLB ArrayBuffer.
   */
  export(worldGroup: THREE.Group, profile: GameProfile | null = null): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const exportRoot = this.wrapForExport(worldGroup, profile);
      this.executeExport(exportRoot, resolve, reject);
    });
  }

  /**
   * Builds a filtered export graph and applies the optional profile transform.
   * The original world group remains untouched.
   *
   * @param worldGroup The original scene root.
   * @param profile Active game profile, or null.
   * @returns A wrapped group ready for GLTFExporter.
   */
  private wrapForExport(worldGroup: THREE.Group, profile: GameProfile | null): THREE.Group {
    const exportScene = buildExportScene(worldGroup);
    const transform = buildExportRootTransform(profile);
    if (transform.equals(new THREE.Matrix4())) {
      return exportScene;
    }
    const wrapper = new THREE.Group();
    wrapper.name = 'ExportRoot';
    wrapper.matrixAutoUpdate = false;
    wrapper.matrix.copy(transform);
    wrapper.add(exportScene);
    return wrapper;
  }

  /**
   * Executes the GLTFExporter callback and resolves the promise.
   *
   * @param exportRoot The group to export.
   * @param resolve The promise resolve function.
   * @param reject The promise reject function.
   */
  private executeExport(
    exportRoot: THREE.Group,
    resolve: (buffer: ArrayBuffer) => void,
    reject: (error: Error) => void,
  ): void {
    const exporter = new GLTFExporter();
    exporter.parse(
      exportRoot,
      (result) => this.onExportSuccess(result, resolve),
      (error) => this.onExportError(error, reject),
      { binary: true },
    );
  }

  /**
   * Handles successful export by resolving with the result buffer.
   *
   * @param result The export result, expected to be an ArrayBuffer.
   * @param resolve The promise resolve function.
   */
  private onExportSuccess(result: ArrayBuffer | object, resolve: (buffer: ArrayBuffer) => void): void {
    if (result instanceof ArrayBuffer) {
      resolve(result);
      return;
    }
    resolve(new ArrayBuffer(0));
  }

  /**
   * Handles export errors by rejecting with the error message.
   *
   * @param error The error thrown by GLTFExporter.
   * @param reject The promise reject function.
   */
  private onExportError(error: unknown, reject: (error: Error) => void): void {
    if (error instanceof Error) {
      reject(error);
      return;
    }
    reject(new Error(String(error)));
  }
}
