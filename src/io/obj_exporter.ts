import * as THREE from 'three';
import { buildExportScene } from './export_scene_builder.js';
import type { GameProfile } from '../settings/settings_types.js';
import { buildExportRootTransform } from './coordinate_space_transform.js';
import type { ObjExportPackage } from './obj_export_types.js';
import { ObjMaterialCollector } from './obj_material_collector.js';
import { ObjGeometryWriter } from './obj_geometry_writer.js';
import { buildMtlDocument } from './obj_mtl_writer.js';
import { encodeObjTextureFiles } from './obj_texture_encoder.js';

/**
 * Exports a Three.js scene group as a Wavefront OBJ package: .obj geometry,
 * companion .mtl materials, and PNG maps referenced by map_Kd. Filters editor
 * helpers the same way as GLB export and optionally applies the active game
 * profile's unit and coordinate-space conversion.
 */
export class ObjExporter {
  /**
   * Builds a complete Wavefront export package for the world group.
   *
   * @param worldGroup The live editor world root to export.
   * @param profile Active game profile, or null to skip conversion.
   * @param baseFileName Base name without extension (e.g. "scene").
   * @returns Package with obj, mtl, and texture files.
   */
  async exportPackage(
    worldGroup: THREE.Group,
    profile: GameProfile | null = null,
    baseFileName = 'scene',
  ): Promise<ObjExportPackage> {
    const exportRoot = this.wrapForExport(worldGroup, profile);
    exportRoot.updateMatrixWorld(true);
    const collector = new ObjMaterialCollector();
    const geometryWriter = new ObjGeometryWriter();
    this.writeMeshes(exportRoot, collector, geometryWriter);
    const slots = collector.getSlots();
    const safeBase = this.sanitizeBaseFileName(baseFileName);
    const mtlFileName = `${safeBase}.mtl`;
    const textures = await encodeObjTextureFiles(slots);
    return {
      objFileName: `${safeBase}.obj`,
      objText: this.buildObjDocument(mtlFileName, geometryWriter.getBody()),
      mtlFileName,
      mtlText: buildMtlDocument(slots),
      textures,
    };
  }

  /**
   * Synchronous geometry-only helper kept for tests that only need OBJ text.
   * Prefer {@link exportPackage} for full material export.
   *
   * @param worldGroup The live editor world root to export.
   * @param profile Active game profile, or null to skip conversion.
   * @returns OBJ file contents as UTF-8 text.
   */
  export(worldGroup: THREE.Group, profile: GameProfile | null = null): string {
    const exportRoot = this.wrapForExport(worldGroup, profile);
    exportRoot.updateMatrixWorld(true);
    const collector = new ObjMaterialCollector();
    const geometryWriter = new ObjGeometryWriter();
    this.writeMeshes(exportRoot, collector, geometryWriter);
    return this.buildObjDocument('scene.mtl', geometryWriter.getBody());
  }

  /**
   * Traverses the export graph and writes every mesh.
   *
   * @param root Export root.
   * @param collector Material registry.
   * @param geometryWriter Geometry writer.
   */
  private writeMeshes(root: THREE.Object3D, collector: ObjMaterialCollector, geometryWriter: ObjGeometryWriter): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.visible) return;
      const slots = collector.registerMeshMaterials(object);
      geometryWriter.writeMesh(object, slots);
    });
  }

  /**
   * Builds a filtered export graph and applies the optional profile transform.
   *
   * @param worldGroup The original scene root.
   * @param profile Active game profile, or null.
   * @returns A wrapped group ready for serialization.
   */
  private wrapForExport(worldGroup: THREE.Group, profile: GameProfile | null): THREE.Group {
    const exportScene = buildExportScene(worldGroup);
    const transform = buildExportRootTransform(profile);
    if (transform.equals(new THREE.Matrix4())) {
      return exportScene;
    }
    return this.wrapWithTransform(exportScene, transform);
  }

  /**
   * Wraps the filtered export scene under a transformed root node.
   *
   * @param exportScene Filtered content scene.
   * @param transform Profile conversion matrix.
   * @returns Root group with the transform applied.
   */
  private wrapWithTransform(exportScene: THREE.Group, transform: THREE.Matrix4): THREE.Group {
    const wrapper = new THREE.Group();
    wrapper.name = 'ExportRoot';
    wrapper.matrixAutoUpdate = false;
    wrapper.matrix.copy(transform);
    wrapper.add(exportScene);
    return wrapper;
  }

  /**
   * Assembles the final OBJ document with header and mtllib reference.
   *
   * @param mtlFileName Companion MTL file name.
   * @param body Geometry body text.
   * @returns Complete OBJ document.
   */
  private buildObjDocument(mtlFileName: string, body: string): string {
    const header = [
      '# Wavefront OBJ exported by AI World Editor',
      '# https://github.com/henrydejongh/AiWorldEd',
      `mtllib ${mtlFileName}`,
      '',
    ].join('\n');
    const trimmedBody = body.trim();
    return trimmedBody.length > 0 ? `${header}${trimmedBody}\n` : `${header}\n`;
  }

  /**
   * Sanitizes a base file name without extension.
   *
   * @param baseFileName Suggested base name.
   * @returns Safe base name.
   */
  private sanitizeBaseFileName(baseFileName: string): string {
    const trimmed = baseFileName.trim().replace(/\.(obj|mtl)$/i, '');
    const safe = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '_');
    return safe.length > 0 ? safe : 'scene';
  }
}
