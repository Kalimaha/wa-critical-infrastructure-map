import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
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

    it('uses the Western Australia badge, a black swan on a yellow disc', () => {
        const icon = readPng(resolve(process.cwd(), 'public/apple-touch-icon.png'));
        expect(icon.width).toBe(180);
        expect(icon.height).toBe(180);

        let yellow = 0;
        let black = 0;
        for (const [red, green, blue, alpha] of icon.pixels) {
            if (alpha === 0) continue;
            if (red > 180 && green > 140 && blue < 80) yellow += 1;
            else if (red < 40 && green < 40 && blue < 40) black += 1;
        }
        expect(yellow).toBeGreaterThan(black);
        expect(black).toBeGreaterThan(5_000);
    });
});

function readPng(path: string) {
    const data = readFileSync(path);
    let offset = 8;
    let width = 0;
    let height = 0;
    const compressed: Buffer[] = [];
    while (offset < data.length) {
        const length = data.readUInt32BE(offset);
        const tag = data.toString('ascii', offset + 4, offset + 8);
        const chunk = data.subarray(offset + 8, offset + 8 + length);
        offset += 12 + length;
        if (tag === 'IHDR') {
            width = chunk.readUInt32BE(0);
            height = chunk.readUInt32BE(4);
        } else if (tag === 'IDAT') {
            compressed.push(chunk);
        } else if (tag === 'IEND') {
            break;
        }
    }
    const raw = inflateSync(Buffer.concat(compressed));
    const stride = width * 4;
    const pixels: number[][] = [];
    let cursor = 0;
    let previous = new Uint8Array(stride);
    for (let y = 0; y < height; y += 1) {
        const filter = raw[cursor];
        cursor += 1;
        const row = Uint8Array.from(raw.subarray(cursor, cursor + stride));
        cursor += stride;
        for (let x = 0; x < stride; x += 1) {
            const left = x >= 4 ? row[x - 4] : 0;
            const up = previous[x];
            const upLeft = x >= 4 ? previous[x - 4] : 0;
            if (filter === 1) row[x] = (row[x] + left) & 255;
            else if (filter === 2) row[x] = (row[x] + up) & 255;
            else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
            else if (filter === 4) {
                const estimate = left + up - upLeft;
                const leftDistance = Math.abs(estimate - left);
                const upDistance = Math.abs(estimate - up);
                const upLeftDistance = Math.abs(estimate - upLeft);
                const predicted = leftDistance <= upDistance && leftDistance <= upLeftDistance
                    ? left
                    : upDistance <= upLeftDistance ? up : upLeft;
                row[x] = (row[x] + predicted) & 255;
            }
        }
        previous = row;
        for (let x = 0; x < width; x += 1) {
            const index = x * 4;
            pixels.push([row[index], row[index + 1], row[index + 2], row[index + 3]]);
        }
    }
    return { width, height, pixels };
}
