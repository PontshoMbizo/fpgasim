import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.js'],
  format: ['cjs', 'esm'],
  dts: false, // Turn off dts since it's JS, unless we add JSDoc types
  external: ['react', 'react-dom', 'next', 'framer-motion', 'lucide-react', '@monaco-editor/react', 'react-zoom-pan-pinch'],
  clean: true,
  esbuildOptions(options) {
    options.loader = {
      ...options.loader,
      '.js': 'jsx',
    };
  },
});
