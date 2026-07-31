/**
 * Clean stroke SVG eye icons for outliner visibility toggles. Open eye means
 * visible; open eye with a red slash means hidden.
 */
export class IconOutlinerVisibility {
  private static readonly strokeAttributes =
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  private static readonly redSlashAttributes =
    'fill="none" stroke="#e74c3c" stroke-width="2.25" stroke-linecap="round"';

  /**
   * Returns SVG markup for a visible object (open eye with pupil).
   *
   * @returns Inline SVG string.
   */
  static openEye(): string {
    return IconOutlinerVisibility.wrapSvg(IconOutlinerVisibility.eyePaths());
  }

  /**
   * Returns SVG markup for a hidden object (eye with a red diagonal slash).
   *
   * @returns Inline SVG string.
   */
  static hiddenEye(): string {
    const redSlash = `<path d="M4 4l16 16" ${IconOutlinerVisibility.redSlashAttributes}/>`;
    return IconOutlinerVisibility.wrapSvg(`${IconOutlinerVisibility.eyePaths()}${redSlash}`);
  }

  /**
   * Builds the shared open-eye outline and pupil path markup.
   *
   * @returns SVG path elements for the eye shape.
   */
  private static eyePaths(): string {
    const lid = `<path d="M2.1 12.3a1 1 0 0 1 0-.6 10.8 10.8 0 0 1 19.8 0 1 1 0 0 1 0 .6 10.8 10.8 0 0 1-19.8 0" ${IconOutlinerVisibility.strokeAttributes}/>`;
    const pupil = `<circle cx="12" cy="12" r="3" ${IconOutlinerVisibility.strokeAttributes}/>`;
    return `${lid}${pupil}`;
  }

  /**
   * Wraps path content in a 14px SVG sized for outliner row slots.
   *
   * @param content Inner SVG path markup.
   * @returns Complete SVG element markup.
   */
  private static wrapSvg(content: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">${content}</svg>`;
  }
}
