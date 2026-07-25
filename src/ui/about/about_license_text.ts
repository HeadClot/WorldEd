/**
 * Third-party license notices shown in the About dialog. Keep project brand
 * names from the reference folder out of this text.
 */

const THREE_JS_LICENSE = `MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/**
 * Returns the full third-party license block for the About dialog textbox.
 *
 * @returns Combined MIT license text for runtime dependencies.
 */
export function getAboutLicenseText(): string {
  return ['=== three.js (MIT) ===', THREE_JS_LICENSE].join('\n');
}

/** Discord invite URL for Henry's Tools community server. */
export const HENRYS_TOOLS_DISCORD_URL = 'https://discord.gg/sKEvrBwHtq';

/** Display name of this editor project. */
export const PROJECT_DISPLAY_NAME = 'AI World Editor';
