import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createTextureFilterPolicy } from '@/texture/library/policy_texture_filter.js';
import { TextureMapCache, setTextureMapCacheForTests } from '@/texture/library/texture_map_cache.js';
import { TextureLibrary } from '@/texture/library/texture_library.js';
import { createTextureBrowserEntry, type TextureBrowserEntry } from '@/texture/library/texture_browser_entry.js';
import { mockObjectUrlApis } from './utils_object_url_test.js';

describe('TextureMapCache filter policy', () => {
  afterEach(() => {
    setTextureMapCacheForTests(null);
    vi.restoreAllMocks();
  });

  it('configures newly resolved content maps with the active filter policy', () => {
    mockObjectUrlApis('blob:filter-new');
    const cache = new TextureMapCache();
    setTextureMapCacheForTests(cache);
    cache.setLibrary(createLibraryWithEntry('stone-a.png'));
    cache.setFilterPolicy(createTextureFilterPolicy('trilinear', '8x', 16));

    const texture = cache.resolve('stone-a.png');

    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.anisotropy).toBe(8);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
  });

  it('reapplies filter policy to already cached maps when settings change', () => {
    mockObjectUrlApis('blob:filter-reapply');
    const cache = new TextureMapCache();
    setTextureMapCacheForTests(cache);
    cache.setLibrary(createLibraryWithEntry('brick-b.png'));
    cache.setFilterPolicy(createTextureFilterPolicy('trilinear', 'max', 16));
    const texture = cache.resolve('brick-b.png');
    expect(texture.anisotropy).toBe(16);

    cache.setFilterPolicy(createTextureFilterPolicy('point', 'max', 16));

    expect(texture.magFilter).toBe(THREE.NearestFilter);
    expect(texture.minFilter).toBe(THREE.NearestFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(texture.anisotropy).toBe(1);
  });
});

/**
 * Builds a texture library containing one synthetic browser entry.
 *
 * @param relativePath Relative path used as the texture id.
 * @returns Library with a single folder entry.
 */
function createLibraryWithEntry(relativePath: string): TextureLibrary {
  const library = new TextureLibrary();
  const entry = createEntry(relativePath);
  library.replaceAll('TestFolder', [entry]);
  return library;
}

/**
 * Creates a test texture entry for the given relative path.
 *
 * @param relativePath Relative path id.
 * @returns Browser entry.
 */
function createEntry(relativePath: string): TextureBrowserEntry {
  return createTextureBrowserEntry(new File(['img'], relativePath, { type: 'image/png' }), relativePath);
}
