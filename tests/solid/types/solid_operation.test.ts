import { describe, it, expect } from 'vitest';
import { SolidOperation, solidOperationToggleAdditiveSubtractive } from '@/solid/types/solid_operation.js';

describe('solidOperationToggleAdditiveSubtractive', () => {
  it('flips additive to subtractive and subtractive to additive', () => {
    expect(solidOperationToggleAdditiveSubtractive(SolidOperation.Additive)).toBe(SolidOperation.Subtractive);
    expect(solidOperationToggleAdditiveSubtractive(SolidOperation.Subtractive)).toBe(SolidOperation.Additive);
  });

  it('leaves intersecting unchanged', () => {
    expect(solidOperationToggleAdditiveSubtractive(SolidOperation.Intersecting)).toBeNull();
  });
});
