import { describe, expect, it } from 'vitest';
import electrobunConfig from '../../electrobun.config.js';

describe('Electrobun desktop build configuration', () => {
  it('packages the existing editor application as a native desktop window', () => {
    expect(electrobunConfig.app.name).toBe('AiWorldEd');
    expect(electrobunConfig.build?.bun?.entrypoint).toBe('src/desktop/bun/index.ts');
    expect(electrobunConfig.build?.views?.main_ui?.entrypoint).toBe('src/desktop/main_ui/index.ts');
    expect(electrobunConfig.build?.copy?.['src/desktop/main_ui/index.html']).toBe(
      'views/main_ui/index.html',
    );
    expect(electrobunConfig.build?.win).toMatchObject({
      defaultRenderer: 'native',
      bundleCEF: false,
    });
  });
});
