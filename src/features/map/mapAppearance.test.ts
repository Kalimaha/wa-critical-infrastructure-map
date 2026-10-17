import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    currentMapBackgroundColor,
    getMapBackgroundColor,
    MAP_BACKGROUND_DARK,
    MAP_BACKGROUND_LIGHT,
    watchColorScheme,
} from './mapAppearance';

describe('map appearance', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uses the light canvas unless the device prefers dark', () => {
        expect(getMapBackgroundColor(false)).toBe(MAP_BACKGROUND_LIGHT);
        expect(getMapBackgroundColor(true)).toBe(MAP_BACKGROUND_DARK);
    });

    it('reads the current color scheme and follows later changes', () => {
        const listeners = new Set<() => void>();
        const media = {
            matches: false,
            addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
            removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
        };
        vi.stubGlobal('matchMedia', () => media);

        expect(currentMapBackgroundColor()).toBe(MAP_BACKGROUND_LIGHT);
        const onChange = vi.fn();
        const stop = watchColorScheme(onChange);
        media.matches = true;
        listeners.forEach(listener => listener());
        expect(onChange).toHaveBeenCalledOnce();
        expect(currentMapBackgroundColor()).toBe(MAP_BACKGROUND_DARK);

        stop();
        listeners.forEach(listener => listener());
        expect(onChange).toHaveBeenCalledOnce();
    });
});

describe('home screen install', () => {
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/manifest.webmanifest'), 'utf8')) as {
        display: string;
        start_url: string;
        scope: string;
        icons: { src: string; sizes: string }[];
    };

    it('exposes an installable web app manifest and an iPhone home screen icon', () => {
        expect(indexHtml).toContain('rel="manifest" href="./manifest.webmanifest"');
        expect(indexHtml).toContain('name="apple-mobile-web-app-capable" content="yes"');
        expect(indexHtml).toContain('rel="apple-touch-icon" href="./apple-touch-icon.png"');
        expect(indexHtml).toContain('name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"');
        expect(indexHtml).toContain('name="theme-color" content="#1c2421" media="(prefers-color-scheme: dark)"');
        expect(manifest.display).toBe('standalone');
        expect(manifest.start_url).toBe('./index.html');
        expect(manifest.scope).toBe('./');
        expect(manifest.icons.map(icon => icon.sizes)).toEqual(['192x192', '512x512']);
        for (const icon of ['public/apple-touch-icon.png', 'public/icon-192.png', 'public/icon-512.png']) {
            expect(existsSync(resolve(process.cwd(), icon))).toBe(true);
        }
        const iconLicense = readFileSync(resolve(process.cwd(), 'public/icon-license.txt'), 'utf8');
        expect(iconLicense).toContain('Badge of Western Australia.svg');
        expect(iconLicense).toContain('CC BY-SA 4.0');
    });
});
