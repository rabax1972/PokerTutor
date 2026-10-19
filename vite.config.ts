/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In produzione l'app è pubblicata su www.giacomorabaglia.com/pokertutor/ (modificabile con BASE_PATH).
// `npm run dev` resta su "/"; build e `vite preview` usano il percorso di produzione.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'serve' && !isPreview ? '/' : (process.env.BASE_PATH ?? '/pokertutor/'),
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
}));
