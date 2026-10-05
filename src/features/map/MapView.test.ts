import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MapView from './MapView';
import type { MapLayerVisibility } from './usePmtilesMap';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];
const containers: HTMLDivElement[] = [];

function renderMapView(props: Parameters<typeof MapView>[0]) {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    containers.push(container);
    act(() => root.render(createElement(MapView, props)));
    return container;
}

afterEach(() => {
    act(() => roots.splice(0).forEach(root => root.unmount()));
    containers.splice(0).forEach(container => container.remove());
});

describe('map layer control', () => {
    const visibility: MapLayerVisibility = { roads: true, boundaries: false, facilities: true };

    it('shows all three layer toggles with the supplied visibility', () => {
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: visibility,
            onLayerVisibilityChange: vi.fn(),
        });
        const control = container.querySelector('[role="group"][aria-labelledby="map-layers-title"]');
        const checkboxes = [...container.querySelectorAll<HTMLInputElement>('.map-layer-control input')];

        expect(control?.textContent).toContain('Map layers');
        expect(checkboxes).toHaveLength(3);
        expect(checkboxes.map(checkbox => checkbox.parentElement?.textContent?.trim())).toEqual([
            'Roads',
            'LGA boundaries',
            'Police facilities',
        ]);
        expect(checkboxes.map(checkbox => checkbox.checked)).toEqual([true, false, true]);
    });

    it('notifies the parent when police facilities are toggled', () => {
        const onLayerVisibilityChange = vi.fn();
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: visibility,
            onLayerVisibilityChange,
        });
        const facilities = [...container.querySelectorAll<HTMLInputElement>('.map-layer-control input')][2];

        act(() => facilities.click());

        expect(onLayerVisibilityChange).toHaveBeenCalledWith('facilities', false);
    });
});

describe('map legend', () => {
    it('shows road classes, LGA boundaries, and police facilities', () => {
        const container = renderMapView({ status: 'Ready', loading: false });
        const legend = container.querySelector('[aria-label="Road network legend"]');
        const entries = [...container.querySelectorAll('.map-legend__item')]
            .map(entry => entry.textContent?.trim());

        expect(legend?.querySelector('.map-legend__title')?.textContent).toBe('Legend');
        expect(entries).toEqual([
            'crossover',
            'local road',
            'main roads controlled path',
            'miscellaneous road',
            'proposed road',
            'state road',
            'LGA boundaries',
            'Police facilities',
        ]);
        expect(legend?.querySelector('.map-legend__swatch--boundary')).not.toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--facility')).not.toBeNull();
    });
});