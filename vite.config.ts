import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  // Relative base so GitHub Pages project sites resolve index.js next to index.html.
  base: './',
  build: {
    outDir: 'docs',
    // Single-file app bundle so GitHub Pages never needs lazy chunk URLs.
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'index.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
