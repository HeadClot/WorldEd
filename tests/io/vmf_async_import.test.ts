import { describe, it, expect } from 'vitest';
import { VmfSolidImporter } from '../../src/io/vmf/vmf_solid_importer.js';
import { yieldToBrowser } from '../../src/utils/async_yield.js';
import { buildAxisAlignedWorldSolidVmf } from './vmf/vmf_test_solids.js';

/** Unit tests for async VMF import progress and yield behavior. */
describe('VmfSolidImporter async', () => {
  it('reports progress from parse through rebuild', async () => {
    const importer = new VmfSolidImporter();
    const labels: string[] = [];
    const ratios: number[] = [];
    const source = buildAxisAlignedWorldSolidVmf({ x: -32, y: -32, z: -32 }, { x: 32, y: 32, z: 32 });
    const result = await importer.importFromTextAsync(source, {
      modelName: 'ProgressTest',
      rebuild: true,
      onProgress: (ratio, label) => {
        ratios.push(ratio);
        labels.push(label);
      },
    });
    expect(result.importedBrushCount).toBe(1);
    expect(labels.length).toBeGreaterThan(2);
    expect(labels.some((label) => /pars/i.test(label))).toBe(true);
    expect(Math.max(...ratios)).toBeGreaterThanOrEqual(0.99);
    expect(result.model.getBrushCount()).toBe(1);
  });

  it('yieldToBrowser resolves without throwing', async () => {
    await expect(yieldToBrowser()).resolves.toBeUndefined();
  });
});
