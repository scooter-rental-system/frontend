import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy /api calls to Spring Boot backend (no changeOrigin so Host header is preserved)
      '/api': { target: 'http://localhost:8080', changeOrigin: false },
    },
  },
});
