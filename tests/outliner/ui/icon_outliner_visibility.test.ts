import { describe, expect, it } from 'vitest';
import { IconOutlinerVisibility } from '@/outliner/ui/icon_outliner_visibility.js';

describe('IconOutlinerVisibility', () => {
  it('should return an SVG open eye that uses currentColor stroke', () => {
    const markup = IconOutlinerVisibility.openEye();
    expect(markup).toContain('<svg');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('<circle');
    expect(markup).not.toContain('#e74c3c');
  });

  it('should return a hidden eye SVG with a red slash over the eye', () => {
    const markup = IconOutlinerVisibility.hiddenEye();
    expect(markup).toContain('<svg');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('stroke="#e74c3c"');
    expect(markup).toContain('M4 4l16 16');
    expect(markup).toContain('<circle');
  });

  it('should keep both icons at the same outliner slot size', () => {
    const openEye = IconOutlinerVisibility.openEye();
    const hiddenEye = IconOutlinerVisibility.hiddenEye();
    expect(openEye).toContain('width="14"');
    expect(openEye).toContain('height="14"');
    expect(hiddenEye).toContain('width="14"');
    expect(hiddenEye).toContain('height="14"');
  });

  it('should mark icons as decorative for assistive technology', () => {
    expect(IconOutlinerVisibility.openEye()).toContain('aria-hidden="true"');
    expect(IconOutlinerVisibility.hiddenEye()).toContain('aria-hidden="true"');
  });
});
