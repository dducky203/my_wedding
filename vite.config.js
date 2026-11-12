import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Ứng dụng đa trang (giống bản gốc): mỗi trang là một entry riêng,
// build ra file tĩnh, chạy được trên mọi hosting tĩnh mà không cần rewrite.
export default defineConfig({
  // Đường dẫn tương đối: link share phục vụ app dưới một subpath
  // (muse.ai/s/...) nên đường dẫn tuyệt đối /assets/... sẽ trỏ sai
  // về gốc domain và trang trắng. Bản gốc HTML cũng dùng đường dẫn
  // tương đối (./css/..., ./js/...) nên bản React phải theo cùng cách.
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        rsvp: resolve(__dirname, 'rsvp.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        login: resolve(__dirname, 'admin/login.html'),
      },
    },
  },
});
