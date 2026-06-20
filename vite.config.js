import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// For GitHub Pages: served at https://nkhippo.github.io/English-Listening-Trainer/
export default defineConfig({
  plugins: [react()],
  base: '/English-Listening-Trainer/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/data/cefr/')) return 'cefr-data';
        },
      },
    },
  },
});
