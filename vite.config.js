import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/flow': {
        target: 'https://app.frostbitefeeders.com',
        changeOrigin: true,
        secure: true,
        headers: {
          'x-tenant-id': 'frostbite',
        },
      },
    },
  },
});
