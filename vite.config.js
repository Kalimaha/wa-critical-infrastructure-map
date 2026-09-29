import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    root: 'src',
    base: './',
    plugins: [react()],
    optimizeDeps: {
        exclude: ['maplibre-gl'],
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true,
    },
});