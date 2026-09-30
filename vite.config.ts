import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: './',
    plugins: [react()],
    resolve: {
        dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
        exclude: ['maplibre-gl'],
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1100,
    },
});