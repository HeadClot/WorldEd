import { afterEach, describe, expect, it } from 'vitest';
import { showConfirmDialog } from '../../src/ui/confirm_dialog.js';

describe('showConfirmDialog', () => {
  let host: HTMLElement;

  afterEach(() => {
    document.querySelectorAll('.editor-confirm-dialog-backdrop').forEach((node) => node.remove());
    host?.remove();
  });

  it('resolves true when Yes is clicked', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const promise = showConfirmDialog({
      host,
      title: 'Create New Scene',
      message: 'Any unsaved changes will be permanently lost.',
    });
    const yes = host.querySelector('[data-confirm-accept="true"]') as HTMLButtonElement;
    expect(yes.textContent).toBe('Yes');
    yes.click();
    await expect(promise).resolves.toBe(true);
    expect(host.querySelector('.editor-confirm-dialog-backdrop')).toBeNull();
  });

  it('resolves false when No is clicked', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const promise = showConfirmDialog({
      host,
      title: 'Create New Scene',
      message: 'Any unsaved changes will be permanently lost.',
    });
    const no = host.querySelector('[data-confirm-cancel="true"]') as HTMLButtonElement;
    expect(no.textContent).toBe('No');
    no.click();
    await expect(promise).resolves.toBe(false);
  });

  it('resolves false when Escape is pressed', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const promise = showConfirmDialog({
      host,
      title: 'Create New Scene',
      message: 'Discard changes?',
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(promise).resolves.toBe(false);
  });
});
