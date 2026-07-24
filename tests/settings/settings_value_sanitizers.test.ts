import { describe, expect, it } from 'vitest';
import { createDefaultMouseSettings, createDefaultViewSettings } from '../../src/settings/settings_defaults.js';
import {
  areMouseSettingsEqual,
  clampNumber,
  mergeMouseSettings,
  mergeViewSettings,
  sanitizeBoolean,
  sanitizeTheme,
} from '../../src/settings/settings_value_sanitizers.js';

describe('settings_value_sanitizers', () => {
  it('clamps finite numbers into the inclusive range', () => {
    expect(clampNumber(5, 0, 10)).toBe(5);
    expect(clampNumber(-3, 0, 10)).toBe(0);
    expect(clampNumber(99, 0, 10)).toBe(10);
    expect(clampNumber(Number.NaN, 0, 10)).toBe(0);
  });

  it('accepts only known theme preferences', () => {
    expect(sanitizeTheme('dark', 'system')).toBe('dark');
    expect(sanitizeTheme('neon', 'system')).toBe('system');
  });

  it('merges mouse settings without mutating defaults', () => {
    const defaults = createDefaultMouseSettings();
    const originalLook = defaults.lookSensitivity;
    const merged = mergeMouseSettings(defaults, { lookSensitivity: originalLook + 1 });
    expect(merged.lookSensitivity).toBe(originalLook + 1);
    expect(defaults.lookSensitivity).toBe(originalLook);
    expect(areMouseSettingsEqual(defaults, defaults)).toBe(true);
    expect(areMouseSettingsEqual(defaults, merged)).toBe(false);
  });

  it('merges view settings JSON and falls back on invalid text', () => {
    const defaults = createDefaultViewSettings();
    const merged = mergeViewSettings(defaults, JSON.stringify({ brightness: 150, theme: 'light' }));
    expect(merged.brightness).toBe(150);
    expect(merged.theme).toBe('light');
    expect(mergeViewSettings(defaults, '{not-json')).toEqual(defaults);
  });

  it('sanitizes booleans with a fallback', () => {
    expect(sanitizeBoolean(true, false)).toBe(true);
    expect(sanitizeBoolean('yes', false)).toBe(false);
  });
});
