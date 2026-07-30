import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyDetachedWindowFavicon,
  collectFaviconLinkSpecs,
  embedDetachedWindowFaviconDataUrl,
} from '@/viewports/detached/detached_window_favicon.js';

describe('detached_window_favicon', () => {
  afterEach(() => {
    document.head.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((node) => {
      node.remove();
    });
    vi.restoreAllMocks();
  });

  it('should copy absolute opener favicon links onto the target document head', () => {
    const sourceIcon = document.createElement('link');
    sourceIcon.rel = 'icon';
    sourceIcon.type = 'image/png';
    sourceIcon.href = 'https://example.test/app-icon.png';
    document.head.appendChild(sourceIcon);

    const target = document.implementation.createHTMLDocument('popup');
    applyDetachedWindowFavicon(target, document);

    const applied = target.head.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    expect(applied).not.toBeNull();
    expect(applied!.href).toContain('app-icon.png');
    expect(applied!.type).toBe('image/png');
  });

  it('should collect favicon specs from the opener document', () => {
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = 'https://example.test/favicon.ico';
    document.head.appendChild(icon);
    const specs = collectFaviconLinkSpecs(document);
    expect(specs.some((spec) => spec.href.includes('favicon.ico'))).toBe(true);
  });

  it('should embed the primary favicon as a data URL for about:blank reliability', async () => {
    const sourceIcon = document.createElement('link');
    sourceIcon.rel = 'icon';
    sourceIcon.href = 'https://example.test/favicon.ico';
    document.head.appendChild(sourceIcon);

    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob([bytes], { type: 'image/x-icon' }),
      })),
    );

    const target = document.implementation.createHTMLDocument('popup');
    await embedDetachedWindowFaviconDataUrl(target, document);

    const applied = target.head.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    expect(applied).not.toBeNull();
    expect(applied!.href.startsWith('data:')).toBe(true);
  });
});
