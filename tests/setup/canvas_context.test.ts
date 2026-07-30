describe('canvas context test setup', () => {
  it('returns null without logging jsdom implementation warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const canvas = document.createElement('canvas');

    expect(canvas.getContext('2d')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
