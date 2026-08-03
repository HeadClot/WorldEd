import { afterEach, describe, expect, it } from 'vitest';
import {
  AUDIO_SETTINGS_STORAGE_KEY,
  AudioSettings,
  createDefaultAudioSettings,
  loadAudioSettings,
} from '@/audio/settings/audio_settings.js';
import { notificationFrameEvents } from '@/audio/notification/notification_frame_events.js';
import { MemorySettingsStorage } from '@/settings/storage/settings_storage.js';
import {
  allowEditorStorageWritesForTests,
  suppressEditorStorageWrites,
} from '@/settings/storage/clear_editor_storage.js';

afterEach(() => {
  allowEditorStorageWritesForTests();
  notificationFrameEvents.reset();
});

describe('AudioSettings', () => {
  it('defaults to enabled', () => {
    expect(createDefaultAudioSettings().enabled).toBe(true);
    const settings = new AudioSettings(new MemorySettingsStorage());
    expect(settings.isEnabled()).toBe(true);
  });

  it('persists toggle across reload from storage', () => {
    const storage = new MemorySettingsStorage();
    const settings = new AudioSettings(storage);
    settings.setEnabled(false);
    expect(loadAudioSettings(storage).enabled).toBe(false);
    const reloaded = new AudioSettings(storage);
    expect(reloaded.isEnabled()).toBe(false);
  });

  it('toggle flips enabled and returns the new state', () => {
    const settings = new AudioSettings(new MemorySettingsStorage());
    expect(settings.toggle()).toBe(false);
    expect(settings.isEnabled()).toBe(false);
    expect(settings.toggle()).toBe(true);
  });

  it('clears frame-event flags when disabled or re-enabled', () => {
    const settings = new AudioSettings(new MemorySettingsStorage());
    notificationFrameEvents.raiseSelectionMovedWithSnapping();
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasAnySnapFeedbackSnapshot()).toBe(true);
    settings.setEnabled(false);
    expect(notificationFrameEvents.hasAnySnapFeedbackSnapshot()).toBe(false);
    notificationFrameEvents.raiseSelectionMovedWithSnapping();
    notificationFrameEvents.beginFrame();
    settings.setEnabled(true);
    expect(notificationFrameEvents.hasAnySnapFeedbackSnapshot()).toBe(false);
  });

  it('skips writes when editor storage is suppressed', () => {
    const storage = new MemorySettingsStorage();
    const settings = new AudioSettings(storage);
    suppressEditorStorageWrites();
    settings.setEnabled(false);
    expect(storage.getItem(AUDIO_SETTINGS_STORAGE_KEY)).toBeNull();
  });
});
