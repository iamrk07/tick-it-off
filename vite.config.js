import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Simple config for solo-friendly MVP
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 }
});
