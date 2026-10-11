import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';

const PMTILES_BUCKET_URL = 'https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com';

const pmtilesDevelopmentProxy: Plugin = {
    name: 'pmtiles-development-proxy',
    configureServer(server: ViteDevServer) {
        server.middlewares.use('/pmtiles', async (request, response) => {
            const targetUrl = new URL(request.url ?? '/', PMTILES_BUCKET_URL);
            const headers = new Headers();
            if (request.headers.range) {
                headers.set('Range', request.headers.range);
            }

            try {
                const upstreamResponse = await fetch(targetUrl, { headers });
                response.statusCode = upstreamResponse.status;
                upstreamResponse.headers.forEach((value, name) => {
                    response.setHeader(name, value);
                });
                response.setHeader('Access-Control-Allow-Origin', '*');
                if (!upstreamResponse.body) {
                    response.end();
                    return;
                }

                const reader = upstreamResponse.body.getReader();
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (!response.write(value)) {
                            await new Promise<void>((resolve) => response.once('drain', resolve));
                        }
                    }
                    response.end();
                } finally {
                    reader.releaseLock();
                }
            } catch (error) {
                response.statusCode = 502;
                response.end(`PMTiles proxy error: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    },
};

export default defineConfig({
    base: './',
    plugins: [react(), pmtilesDevelopmentProxy],
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