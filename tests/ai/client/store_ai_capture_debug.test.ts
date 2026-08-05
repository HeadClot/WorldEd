import { describe, it, expect } from 'vitest';
import { AI_CAPTURE_DEBUG_MAX_ENTRIES, StoreAiCaptureDebug } from '@/ai/client/store_ai_capture_debug.js';
import { PanelAiCaptureDebug } from '@/ai/client/ui/panel_ai_capture_debug.js';

/**
 * Builds a minimal capture record for store tests.
 *
 * @param label Distinct base64 suffix.
 * @returns Record input.
 */
function makeRecord(label: string) {
  return {
    mimeType: 'image/jpeg',
    base64: btoa(label),
    width: 64,
    height: 64,
    shading: 'solid',
    cameraSummary: 'cam (0, 0, 0) → (0, 0, 0)',
    framedBrushCount: 1,
    message: `Captured ${label}`,
  };
}

/** Unit tests for the AI capture debug store and floating panel list. */
describe('StoreAiCaptureDebug and PanelAiCaptureDebug', () => {
  it('records captures newest first and trims to the max entry count', () => {
    const store = new StoreAiCaptureDebug();
    for (let index = 0; index < AI_CAPTURE_DEBUG_MAX_ENTRIES + 5; index++) {
      store.record(makeRecord(`img_${index}`));
    }
    expect(store.count()).toBe(AI_CAPTURE_DEBUG_MAX_ENTRIES);
    expect(store.list()[0]?.message).toContain(`img_${AI_CAPTURE_DEBUG_MAX_ENTRIES + 4}`);
  });

  it('notifies subscribers and clears all entries', () => {
    const store = new StoreAiCaptureDebug();
    let notifyCount = 0;
    const unsubscribe = store.subscribe(() => {
      notifyCount += 1;
    });
    store.record(makeRecord('a'));
    store.record(makeRecord('b'));
    store.clear();
    expect(store.count()).toBe(0);
    expect(notifyCount).toBe(3);
    unsubscribe();
    store.record(makeRecord('c'));
    expect(notifyCount).toBe(3);
  });

  it('renders list cards for stored captures and empty state after clear', () => {
    const store = new StoreAiCaptureDebug();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const panel = new PanelAiCaptureDebug(host, null, store);
    expect(panel.isMountedInHost()).toBe(false);
    expect(host.contains(panel.getRootElement())).toBe(false);
    store.record(makeRecord('wall'));
    panel.show();
    expect(host.contains(panel.getRootElement())).toBe(true);
    const root = panel.getRootElement();
    expect(root.textContent).toContain('1 capture');
    expect(root.querySelectorAll('img').length).toBe(1);
    store.clear();
    expect(root.textContent).toContain('No AI captures yet');
    expect(root.querySelectorAll('img').length).toBe(0);
    panel.hide();
    expect(host.contains(panel.getRootElement())).toBe(false);
    panel.dispose();
    host.remove();
  });
});
