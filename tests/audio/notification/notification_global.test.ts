import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { notificationFrameEvents } from '@/audio/notification/notification_frame_events.js';
import { NotificationGlobal } from '@/audio/notification/notification_global.js';
import { audioSettings } from '@/audio/settings/audio_settings.js';

beforeEach(() => {
  audioSettings.setEnabled(true);
  notificationFrameEvents.reset();
});

afterEach(() => {
  audioSettings.setEnabled(true);
  notificationFrameEvents.reset();
});

describe('NotificationGlobal', () => {
  it('raises move and scale flags on separate channels', () => {
    NotificationGlobal.onSelectionMovedWithSnapping();
    NotificationGlobal.onSelectionScaledWithSnapping();
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(true);
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
  });

  it('maps resized-with-snapping onto the scale channel with travel distance', () => {
    NotificationGlobal.onSelectionResizedWithSnapping(4);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionScaledWithSnappingSnapshot()).toBe(true);
    expect(notificationFrameEvents.getSelectionResizeTravelSnapshot()).toBe(4);
    expect(notificationFrameEvents.hasSelectionMovedWithSnappingSnapshot()).toBe(false);
  });

  it('raises rotation snaps on their own channel', () => {
    NotificationGlobal.onSelectionRotatedWithSnapping(0.2);
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasSelectionRotatedWithSnappingSnapshot()).toBe(true);
    expect(notificationFrameEvents.getSelectionRotatedSpeedSnapshot()).toBeGreaterThan(0);
  });

  it('does not raise flags while audio is disabled', () => {
    audioSettings.setEnabled(false);
    NotificationGlobal.onSelectionMovedWithSnapping();
    NotificationGlobal.onSelectionScaledWithSnapping();
    notificationFrameEvents.beginFrame();
    expect(notificationFrameEvents.hasAnySnapFeedbackSnapshot()).toBe(false);
  });
});
