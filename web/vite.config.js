import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Las llamadas a /api se redirigen al backend Express.
      '/api': 'http://localhost:4000',
    },
  },
});
