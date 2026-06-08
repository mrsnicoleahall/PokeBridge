import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './', // relative paths so it works under the /PokeBridge/ GitHub Pages subpath (and locally)
  plugins: [react()],
  server: { port: 5273, open: false },
});
