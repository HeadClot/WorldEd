import { describe, expect, it } from 'vitest';
import { OutlinerInsertIndicator } from '../../../src/ui/outliner/outliner_insert_indicator.js';

describe('OutlinerInsertIndicator', () => {
  it('should create a one-pixel-thick hidden marker', () => {
    const indicator = new OutlinerInsertIndicator();
    const element = indicator.getElement();
    expect(element.style.height).toBe('1px');
    expect(element.style.display).toBe('none');
    expect(element.classList.contains('editor-outliner-insert-indicator')).toBe(true);
  });

  it('should show on the top edge for before placement at root depth', () => {
    const host = document.createElement('div');
    host.style.position = 'relative';
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({
        top: 100,
        left: 0,
        bottom: 300,
        right: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperty(host, 'clientWidth', { value: 180, configurable: true });
    Object.defineProperty(host, 'scrollTop', { value: 0, configurable: true });
    const indicator = new OutlinerInsertIndicator();
    const rowRect = {
      top: 140,
      bottom: 160,
      left: 0,
      right: 180,
      width: 180,
      height: 20,
      x: 0,
      y: 140,
      toJSON: () => ({}),
    } as DOMRect;
    indicator.showForRow(host, rowRect, 'before', 0);
    expect(indicator.getElement().style.display).toBe('block');
    expect(indicator.getElement().style.top).toBe('40px');
    expect(indicator.getElement().style.left).toBe('0px');
    expect(indicator.getElement().style.width).toBe('180px');
    expect(indicator.getElement().parentElement).toBe(host);
    host.remove();
  });

  it('should start the nested line at the measured name column left', () => {
    const host = document.createElement('div');
    host.style.position = 'relative';
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({
        top: 0,
        left: 0,
        bottom: 200,
        right: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperty(host, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(host, 'scrollTop', { value: 0, configurable: true });
    const indicator = new OutlinerInsertIndicator();
    const rowRect = {
      top: 40,
      bottom: 60,
      left: 0,
      right: 200,
      width: 200,
      height: 20,
      x: 0,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect;
    const nameLeft = 54;
    indicator.showForRow(host, rowRect, 'after', 2, nameLeft);
    expect(indicator.getElement().style.left).toBe(`${nameLeft}px`);
    expect(indicator.getElement().style.width).toBe(`${200 - nameLeft}px`);
    host.remove();
  });

  it('should hide when placement is into', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const indicator = new OutlinerInsertIndicator();
    indicator.positionAt(12, 0, 100);
    expect(indicator.getElement().style.display).toBe('block');
    const rowRect = {
      top: 0,
      bottom: 20,
      left: 0,
      right: 100,
      width: 100,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
    indicator.showForRow(host, rowRect, 'into', 0);
    expect(indicator.getElement().style.display).toBe('none');
    host.remove();
  });
});
