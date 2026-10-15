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
    const visibility: MapLayerVisibility = {
        roads: true,
        boundaries: false,
        facilities: true,
        responseCoverage: false,
    };

    it('shows all four layer toggles with the supplied visibility', () => {
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: visibility,
            onLayerVisibilityChange: vi.fn(),
        });
        const control = container.querySelector('[role="group"][aria-labelledby="map-layers-title"]');
        const checkboxes = [...container.querySelectorAll<HTMLInputElement>('.map-layer-control input')];

        expect(control?.textContent).toContain('Layers');
        expect((control as HTMLDetailsElement | null)?.open).toBe(true);
        expect(checkboxes).toHaveLength(4);
        expect(checkboxes.map(checkbox => checkbox.parentElement?.textContent?.trim())).toEqual([
            'Roads',
            'LGA boundaries',
            'Police facilities',
            'Response coverage',
        ]);
        expect(checkboxes.map(checkbox => checkbox.checked)).toEqual([true, false, true, false]);
    });

    it('collapses and expands when the title is clicked', () => {
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: visibility,
            onLayerVisibilityChange: vi.fn(),
        });
        const control = container.querySelector('.map-layer-control') as HTMLDetailsElement;
        const summary = control.querySelector('summary');

        expect(control.open).toBe(true);
        act(() => summary?.click());
        expect(control.open).toBe(false);
        act(() => summary?.click());
        expect(control.open).toBe(true);
    });

    it('notifies the parent when response coverage is toggled', () => {
        const onLayerVisibilityChange = vi.fn();
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: visibility,
            onLayerVisibilityChange,
        });
        const responseCoverage = [...container.querySelectorAll<HTMLInputElement>('.map-layer-control input')][3];

        act(() => responseCoverage.click());

        expect(onLayerVisibilityChange).toHaveBeenCalledWith('responseCoverage', true);
    });
});

describe('data attribution', () => {
    it('acknowledges Data WA and links to the catalogue', () => {
        const container = renderMapView({ status: 'Ready', loading: false });
        const attribution = container.querySelector('.map-attribution');
        const link = attribution?.querySelector('a');

        expect(attribution?.textContent).toBe('All raw data shown on this map is from Data WA.');
        expect(link?.textContent).toBe('Data WA');
        expect(link?.getAttribute('href')).toBe('https://data.wa.gov.au/');
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    });
});

describe('map legend', () => {
    it('shows road classes, boundaries, facilities, and response coverage', () => {
        const container = renderMapView({ status: 'Ready', loading: false });
        const legend = container.querySelector('[aria-label="Road network legend"]') as HTMLDetailsElement | null;
        const entries = [...container.querySelectorAll('.map-legend__item')]
            .map(entry => entry.textContent?.trim());

        expect(legend?.querySelector('.map-legend__title')?.textContent).toContain('Legend');
        expect(legend?.open).toBe(true);
        expect(entries).toEqual([
            'crossover',
            'local road',
            'main roads controlled path',
            'miscellaneous road',
            'proposed road',
            'state road',
            'LGA boundaries',
            'Police facilities',
            'Response coverage: under 5 min',
            'Response coverage: 5–10 min',
            'Response coverage: 10–15 min',
            'Response coverage: over 15 min',
            'Response coverage: unreachable',
        ]);
        expect(legend?.querySelector('.map-legend__swatch--boundary')).not.toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--facility')).not.toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--response-green')).not.toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--response-yellow')).not.toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--response-orange')).not.toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--response-red')).not.toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--response-unreachable')).not.toBeNull();
    });

    it('only shows entries for visible layers', () => {
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: { roads: false, boundaries: true, facilities: true, responseCoverage: false },
            onLayerVisibilityChange: vi.fn(),
        });
        const entries = [...container.querySelectorAll('.map-legend__item')]
            .map(entry => entry.textContent?.trim());

        expect(entries).toEqual(['LGA boundaries', 'Police facilities']);
    });

    it('updates when a layer is toggled', () => {
        const props = {
            status: 'Ready',
            loading: false,
            layerVisibility: { roads: false, boundaries: false, facilities: false, responseCoverage: true },
            onLayerVisibilityChange: vi.fn(),
        };
        const container = renderMapView(props);
        const responseEntries = () => [...container.querySelectorAll('.map-legend__item')]
            .filter(entry => entry.textContent?.startsWith('Response coverage'));

        expect(responseEntries()).toHaveLength(5);

        act(() => roots[0].render(createElement(MapView, {
            ...props,
            layerVisibility: { ...props.layerVisibility, responseCoverage: false },
        })));

        expect(responseEntries()).toHaveLength(0);
        expect(container.querySelector('.map-legend__empty')?.textContent).toBe('No layers visible');
    });

    it('collapses and expands when the title is clicked', () => {
        const container = renderMapView({ status: 'Ready', loading: false });
        const legend = container.querySelector('.map-legend') as HTMLDetailsElement;
        const summary = legend.querySelector('summary');

        expect(legend.open).toBe(true);
        act(() => summary?.click());
        expect(legend.open).toBe(false);
        act(() => summary?.click());
        expect(legend.open).toBe(true);
    });
});