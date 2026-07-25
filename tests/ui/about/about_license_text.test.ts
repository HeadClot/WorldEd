import { describe, it, expect } from 'vitest';
import {
  HENRYS_TOOLS_DISCORD_URL,
  PROJECT_DISPLAY_NAME,
  getAboutLicenseText,
} from '../../../src/ui/about/about_license_text.js';

describe('about_license_text', () => {
  it('should expose the project display name', () => {
    expect(PROJECT_DISPLAY_NAME).toBe('AI World Editor');
  });

  it("should expose the Henry's Tools Discord invite URL", () => {
    expect(HENRYS_TOOLS_DISCORD_URL).toBe('https://discord.gg/sKEvrBwHtq');
  });

  it('should embed the three.js MIT license without reference-project names', () => {
    const text = getAboutLicenseText();
    expect(text).toContain('=== three.js (MIT) ===');
    expect(text).toContain('Copyright © 2010-2026 three.js authors');
    expect(text).toContain('Permission is hereby granted, free of charge');
    expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    expect(text.toLowerCase()).not.toContain('chisel');
    expect(text.toLowerCase()).not.toContain('realtimecsg');
    expect(text.toLowerCase()).not.toContain('sabrecsg');
  });
});
