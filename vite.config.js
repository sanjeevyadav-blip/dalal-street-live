import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file output so the build still deploys to GitHub Pages as one index.html.
// root is `src` because the entry (index.html) and the PWA assets live there;
// outDir is therefore written back up to <repo>/dist, which is what
// .github/workflows/deploy.yml and the CI bundle-size guard expect.
export default defineConfig({
  root: 'src',
  base: './',
  publicDir: false,
  plugins: [viteSingleFile()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    // Minification is off for the duration of EPIC-1. The refactor is measured by diffing
    // the built output against the file that is live, and a minifier rewrites colours,
    // drops final semicolons and reorders nothing-in-particular — which buries a real
    // behavioural change inside thousands of cosmetic ones. Turn this back on as its own
    // deliberate change once the module extraction is finished and proven.
    cssMinify: false,
    minify: false,
    rollupOptions: { output: { inlineDynamicImports: true } }
  },
  server: { port: 5173, open: true }
});
