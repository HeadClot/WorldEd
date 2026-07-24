import type { ElectrobunConfig } from 'electrobun/bun';

const electrobunConfig: ElectrobunConfig = {
  app: {
    name: 'AiWorldEd',
    identifier: 'com.henry00is.aiworlded',
    version: '1.0.0',
    description: 'Three.js 3D world editor for game level design.'
  },
  build: {
    bun: {
      entrypoint: 'src/desktop/bun/index.ts'
    },
    views: {
      main_ui: {
        entrypoint: 'src/desktop/main_ui/index.ts'
      }
    },
    copy: {
      'src/desktop/main_ui/index.html': 'views/main_ui/index.html'
    },
    buildFolder: 'desktop_build',
    artifactFolder: 'desktop_artifacts',
    win: {
      defaultRenderer: 'native',
      bundleCEF: false
    },
    mac: {
      defaultRenderer: 'native',
      bundleCEF: false,
      createDmg: false
    },
    linux: {
      defaultRenderer: 'native',
      bundleCEF: false
    }
  },
  runtime: {
    exitOnLastWindowClosed: true
  }
};

export default electrobunConfig;
