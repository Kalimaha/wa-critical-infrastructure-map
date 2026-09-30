import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    resolve: {
        dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'maplibre-gl', 'pmtiles'],
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    include: ['src/**/*.test.ts'],
                    environment: 'jsdom',
                },
            },
            {
                extends: true,
                plugins: [storybookTest({ configDir: '.storybook' })],
                test: {
                    name: 'storybook',
                    browser: {
                        enabled: true,
                        provider: playwright({ launchOptions: { headless: true } }),
                        instances: [{ browser: 'chromium' }],
                    },
                    testTimeout: 60_000,
                },
            },
        ],
    },
});