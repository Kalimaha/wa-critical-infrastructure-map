export const MAP_BACKGROUND_LIGHT = '#f2efe9';
export const MAP_BACKGROUND_DARK = '#1c2421';

const DARK_COLOR_SCHEME = '(prefers-color-scheme: dark)';

export function getMapBackgroundColor(prefersDark: boolean) {
    return prefersDark ? MAP_BACKGROUND_DARK : MAP_BACKGROUND_LIGHT;
}

export function currentMapBackgroundColor() {
    return getMapBackgroundColor(prefersDarkColorScheme());
}

export function watchColorScheme(onChange: () => void) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {};
    }
    const media = window.matchMedia(DARK_COLOR_SCHEME);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
}

function prefersDarkColorScheme() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia(DARK_COLOR_SCHEME).matches;
}
