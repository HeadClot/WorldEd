import * as THREE from 'three';

/** Material slot used when writing usemtl / newmtl entries. */
export interface ObjMaterialSlot {
  /** Stable Wavefront material name (no spaces). */
  name: string;
  /** Diffuse color. */
  color: THREE.Color;
  /** Optional albedo map; null when color-only. */
  map: THREE.Texture | null;
  /** Relative image file name when map is exported, otherwise null. */
  mapFileName: string | null;
}

/**
 * Collects unique materials from an export scene and assigns stable names and
 * map file names for Wavefront MTL output.
 */
export class ObjMaterialCollector {
  private readonly slotsByKey = new Map<string, ObjMaterialSlot>();
  private readonly usedNames = new Set<string>();
  private readonly usedMapNames = new Set<string>();
  private nextIndex = 0;

  /**
   * Registers materials on a mesh and returns the slot list for that mesh
   * (single material or multi-material array order).
   *
   * @param mesh Export mesh.
   * @returns Ordered material slots for the mesh.
   */
  registerMeshMaterials(mesh: THREE.Mesh): ObjMaterialSlot[] {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.map((material, index) => this.registerOneMaterial(material, mesh.name, index));
  }

  /**
   * Returns every unique material slot collected so far.
   *
   * @returns Material slots in insertion order.
   */
  getSlots(): ObjMaterialSlot[] {
    return Array.from(this.slotsByKey.values());
  }

  /**
   * Registers one Three.js material and returns its slot.
   *
   * @param material Live or export material.
   * @param meshName Owning mesh name for fallback naming.
   * @param materialIndex Index within a multi-material array.
   * @returns Unique material slot.
   */
  private registerOneMaterial(material: THREE.Material, meshName: string, materialIndex: number): ObjMaterialSlot {
    const color = this.readDiffuseColor(material);
    const map = this.readDiffuseMap(material);
    const key = this.buildMaterialKey(color, map, material.uuid);
    const existing = this.slotsByKey.get(key);
    if (existing) return existing;
    const slot: ObjMaterialSlot = {
      name: this.allocateMaterialName(material, meshName, materialIndex),
      color: color.clone(),
      map,
      mapFileName: map ? this.allocateMapFileName(map, material) : null,
    };
    this.slotsByKey.set(key, slot);
    return slot;
  }

  /**
   * Builds a dedupe key for color + map identity.
   *
   * @param color Diffuse color.
   * @param map Optional map.
   * @param materialUuid Fallback uuid when no map.
   * @returns Map key string.
   */
  private buildMaterialKey(color: THREE.Color, map: THREE.Texture | null, materialUuid: string): string {
    const mapKey = map ? `map:${map.uuid}` : `noremap:${materialUuid}`;
    return `${color.getHexString()}:${mapKey}`;
  }

  /**
   * Reads the diffuse color from a material, defaulting to white.
   *
   * @param material Material to inspect.
   * @returns Diffuse color.
   */
  private readDiffuseColor(material: THREE.Material): THREE.Color {
    if ('color' in material && material.color instanceof THREE.Color) {
      return material.color;
    }
    return new THREE.Color(0xffffff);
  }

  /**
   * Reads the albedo map when present and not a missing image.
   *
   * @param material Material to inspect.
   * @returns Texture map or null.
   */
  private readDiffuseMap(material: THREE.Material): THREE.Texture | null {
    const mapHost = material as THREE.Material & { map?: THREE.Texture | null };
    const map = mapHost.map ?? null;
    if (!map || !map.image) return null;
    return map;
  }

  /**
   * Allocates a unique Wavefront material name.
   *
   * @param material Source material.
   * @param meshName Owning mesh name.
   * @param materialIndex Multi-material index.
   * @returns Sanitized unique name.
   */
  private allocateMaterialName(material: THREE.Material, meshName: string, materialIndex: number): string {
    const preferred = material.name?.trim() || `${meshName || 'Material'}_${materialIndex}`;
    return this.allocateUniqueToken(preferred, 'Material', this.usedNames);
  }

  /**
   * Allocates a unique relative image file name for a map.
   *
   * @param map Diffuse map.
   * @param material Owning material.
   * @returns File name such as brick.png.
   */
  private allocateMapFileName(map: THREE.Texture, material: THREE.Material): string {
    const base = this.suggestMapBaseName(map, material);
    const stem = this.allocateUniqueToken(base, 'texture', this.usedMapNames);
    return `${stem}.png`;
  }

  /**
   * Suggests a base file name from texture metadata or material name.
   *
   * @param map Diffuse map.
   * @param material Owning material.
   * @returns Base name without extension.
   */
  private suggestMapBaseName(map: THREE.Texture, material: THREE.Material): string {
    if (map.name?.trim()) return map.name;
    if (material.name?.trim()) return material.name;
    const image = map.image as { src?: string } | undefined;
    if (image?.src) {
      const leaf = image.src.split(/[\\/]/).pop() ?? '';
      const withoutQuery = leaf.split('?')[0] ?? leaf;
      const withoutExt = withoutQuery.replace(/\.[a-z0-9]+$/i, '');
      if (withoutExt.length > 0) return withoutExt;
    }
    this.nextIndex += 1;
    return `texture_${this.nextIndex}`;
  }

  /**
   * Sanitizes and uniquifies a token for file or material names.
   *
   * @param raw Preferred raw name.
   * @param fallback Fallback when raw is empty after sanitize.
   * @param used Set of already used tokens.
   * @returns Unique sanitized token.
   */
  private allocateUniqueToken(raw: string, fallback: string, used: Set<string>): string {
    let base = this.sanitizeToken(raw) || fallback;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  }

  /**
   * Converts a free-form name into a Wavefront-safe token.
   *
   * @param raw Raw label.
   * @returns Sanitized token without spaces or path separators.
   */
  private sanitizeToken(raw: string): string {
    return raw
      .trim()
      .replace(/\\/g, '/')
      .split('/')
      .pop()!
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}
