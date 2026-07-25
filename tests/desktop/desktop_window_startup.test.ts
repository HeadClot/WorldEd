import { describe, expect, it, vi } from 'vitest';

import { showMaximizedWhenReady } from '../../src/desktop/desktop_window_startup.js';

describe('desktop window startup', () => {
  it('waits for the webview before maximizing and showing the window', () => {
    let notifyReady = (): void => {};
    const maximize = vi.fn();
    const show = vi.fn();
    const webview = {
      on: vi.fn((_name: 'dom-ready', handler: () => void) => {
        notifyReady = handler;
      }),
    };

    showMaximizedWhenReady({ maximize, show, webview });

    expect(maximize).not.toHaveBeenCalled();
    expect(show).not.toHaveBeenCalled();
    notifyReady();
    expect(maximize).toHaveBeenCalledOnce();
    expect(show).toHaveBeenCalledOnce();
    expect(maximize.mock.invocationCallOrder[0]).toBeLessThan(show.mock.invocationCallOrder[0]);
  });
});
