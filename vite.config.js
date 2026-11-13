import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: '/',
  plugins: [react(), {
    name: 'cloudinary-delete-api',
    configureServer(server) {
      const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
      server.middlewares.use('/api/cloudinary/delete', async (req, res, next) => {
        try {
          const { createDeleteHandler } = await import('./api/cloudinary/delete.js');
          await createDeleteHandler(env)(req, res);
        } catch (error) { next(error); }
      });
    },
  }],
}));
