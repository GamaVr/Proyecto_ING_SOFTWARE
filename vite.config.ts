import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Configura React y redirige la API y los sockets al servidor de desarrollo. */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Los archivos privados no deben ser servidos por Vite durante desarrollo.
    fs: {
      deny: [
        '**/.env',
        '**/.env.*',
        '**/*.{crt,pem}',
        '**/.git/**',
        '**/.runtime/**',
        '**/storage/**',
      ],
    },
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
    },
  },
});
