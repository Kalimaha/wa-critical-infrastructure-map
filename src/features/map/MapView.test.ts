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

describe('app layout', () => {
    it('keeps the map in the center panel and the info accordion in the right panel', () => {
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: {
                roads: true,
                boundaries: true,
                facilities: true,
                dfesStations: true,
                responseCoverage: false,
                fireResponseCoverage: false,
            },
            onLayerVisibilityChange: vi.fn(),
        });
        const app = container.querySelector('.map-app');
        const row = app?.querySelector(':scope > .row');
        const left = container.querySelector('.map-panel--left');
        const center = container.querySelector('.map-panel--center');
        const right = container.querySelector('.map-panel--right');

        expect(app?.classList.contains('container-fluid')).toBe(true);
        expect(row?.className).toContain('flex-column');
        expect(row?.className).toContain('flex-md-row');
        expect(app?.querySelector(':scope > .map-header')).toBeTruthy();
        expect(app?.querySelector(':scope > .map-attribution')).toBeTruthy();
        expect(left?.classList.contains('col-md-auto')).toBe(true);
        expect(left?.className).toContain('order-2');
        expect(left?.className).toContain('order-md-1');
        expect(left?.querySelector('.map-tools__title-text')?.textContent).toBe('Map');
        expect(left?.querySelector('.map-legend')).toBeTruthy();
        expect(left?.querySelector('.map-layer-control')).toBeTruthy();
        expect(center?.classList.contains('col-md')).toBe(true);
        expect(center?.className).toContain('order-1');
        expect(center?.className).toContain('order-md-2');
        expect(center?.querySelector('.map-viewer__canvas')).toBeTruthy();
        expect(center?.querySelector('.map-legend')).toBeNull();
        expect(center?.querySelector('.map-layer-control')).toBeNull();
        expect(right?.classList.contains('col-md-auto')).toBe(true);
        expect(right?.className).toContain('order-3');
        expect(right?.className).toContain('order-md-3');
        expect(right?.querySelector('.map-info')).toBeTruthy();
        expect(row?.contains(left ?? null)).toBe(true);
        expect(row?.contains(center ?? null)).toBe(true);
        expect(row?.contains(right ?? null)).toBe(true);
        expect(center?.contains(left)).toBe(false);
        expect(center?.contains(right)).toBe(false);
    });
});

describe('info panel', () => {
    it('starts collapsed and opens About and Data Sources one at a time', () => {
        const container = renderMapView({ status: 'Ready', loading: false });
        const panel = container.querySelector('.map-info') as HTMLDetailsElement;
        const sections = () => [...panel.querySelectorAll<HTMLDetailsElement>('.map-info__section')];

        expect(panel.open).toBe(false);
        expect(panel.querySelector('.map-info__title-text')?.textContent).toBe('Info');

        act(() => panel.querySelector('summary')?.click());
        expect(panel.open).toBe(true);
        expect(sections().map(section => section.querySelector('summary')?.textContent?.trim())).toEqual([
            'About',
            'Data Sources',
        ]);
        expect(sections()[0].open).toBe(true);
        expect(sections()[0].textContent).toContain('study map');
        expect(sections()[1].open).toBe(false);

        act(() => sections()[1].querySelector('summary')?.click());
        expect(sections()[0].open).toBe(false);
        expect(sections()[1].open).toBe(true);
        expect(sections()[1].textContent).toContain('DFES stations (DFES-023)');

        act(() => panel.querySelector('summary')?.click());
        act(() => panel.querySelector('summary')?.click());
        expect(panel.open).toBe(true);
        expect(sections()[0].open).toBe(false);
        expect(sections()[1].open).toBe(true);
    });
});

describe('map tools panel', () => {
    it('starts collapsed and opens Layers and Legend one at a time', () => {
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: {
                roads: true,
                boundaries: true,
                facilities: true,
                dfesStations: true,
                responseCoverage: false,
                fireResponseCoverage: false,
            },
            onLayerVisibilityChange: vi.fn(),
        });
        const panel = container.querySelector('.map-tools') as HTMLDetailsElement;
        const sections = () => [...panel.querySelectorAll<HTMLDetailsElement>('.map-tools__section')];

        expect(panel.open).toBe(false);
        expect(panel.querySelector('.map-tools__title-text')?.textContent).toBe('Map');

        act(() => panel.querySelector('summary')?.click());
        expect(panel.open).toBe(true);
        expect(sections().map(section => section.querySelector('summary')?.textContent?.trim())).toEqual([
            'Layers',
            'Legend',
        ]);
        expect(sections()[0].open).toBe(true);
        expect(sections()[1].open).toBe(false);

        act(() => sections()[1].querySelector('summary')?.click());
        expect(sections()[0].open).toBe(false);
        expect(sections()[1].open).toBe(true);
        expect(sections()[1].textContent).toContain('LGA Boundaries');

        act(() => panel.querySelector('summary')?.click());
        act(() => panel.querySelector('summary')?.click());
        expect(panel.open).toBe(true);
        expect(sections()[0].open).toBe(false);
        expect(sections()[1].open).toBe(true);
    });
});

describe('map layer control', () => {
    const visibility: MapLayerVisibility = {
        roads: true,
        boundaries: false,
        facilities: true,
        dfesStations: true,
        responseCoverage: false,
        fireResponseCoverage: false,
    };

    it('shows all six layer toggles with the supplied visibility', () => {
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: visibility,
            onLayerVisibilityChange: vi.fn(),
        });
        const control = container.querySelector('[role="group"][aria-labelledby="map-layers-title"]');
        const checkboxes = [...container.querySelectorAll<HTMLInputElement>('.map-layer-control input')];

        expect(control?.textContent).toContain('Layers');
        expect((control as HTMLDetailsElement | null)?.open).toBe(false);
        expect(checkboxes).toHaveLength(6);
        expect(checkboxes.map(checkbox => checkbox.parentElement?.textContent?.trim())).toEqual([
            'Roads',
            'LGA Boundaries',
            'Police Stations',
            'DFES Stations',
            'Police Response Coverage',
            'Fire Response Coverage',
        ]);
        expect(checkboxes.map(checkbox => checkbox.checked)).toEqual([true, false, true, true, false, false]);
    });

    it('uses default visibility when the visibility prop is omitted', () => {
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            onLayerVisibilityChange: vi.fn(),
        });
        const checkboxes = [...container.querySelectorAll<HTMLInputElement>('.map-layer-control input')];

        expect(checkboxes.map(checkbox => checkbox.checked)).toEqual([true, true, true, true, false, false]);
    });

    it('separates processed layers under their own title', () => {
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: visibility,
            onLayerVisibilityChange: vi.fn(),
        });
        const separator = container.querySelector('.map-layer-control__separator');
        const sectionTitle = separator?.nextElementSibling;

        expect(separator?.previousElementSibling?.textContent?.trim()).toBe('DFES Stations');
        expect(sectionTitle?.textContent).toBe('Processed Layers');
        expect(sectionTitle?.nextElementSibling?.textContent?.trim()).toBe('Police Response Coverage');
        expect(sectionTitle?.nextElementSibling?.nextElementSibling?.textContent?.trim()).toBe('Fire Response Coverage');
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

        expect(control.open).toBe(false);
        act(() => summary?.click());
        expect(control.open).toBe(true);
        act(() => summary?.click());
        expect(control.open).toBe(false);
    });

    it('notifies the parent when response coverage is toggled', () => {
        const onLayerVisibilityChange = vi.fn();
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: visibility,
            onLayerVisibilityChange,
        });
        const responseCoverage = [...container.querySelectorAll<HTMLInputElement>('.map-layer-control input')][4];

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
    it('shows the default legend groups when visibility is omitted', () => {
        const container = renderMapView({ status: 'Ready', loading: false });
        const legend = container.querySelector('[aria-label="Map legend"]') as HTMLDetailsElement | null;
        const entries = [...container.querySelectorAll('.map-legend__item')]
            .map(entry => entry.textContent?.trim());

        expect(legend?.querySelector('.map-legend__title')?.textContent).toContain('Legend');
        expect(legend?.open).toBe(false);
        expect(container.querySelectorAll('.map-legend__separator')).toHaveLength(3);
        expect(container.querySelectorAll('.map-legend__list')).toHaveLength(4);
        expect(entries).toEqual([
            'crossover',
            'local road',
            'main roads controlled path',
            'miscellaneous road',
            'proposed road',
            'state road',
            'LGA Boundaries',
            'Police Station',
            'District Office',
            'Multi Functional Police Facility',
            'Multi-Jurisdictional Police Facility',
            'Police Headquarters',
            'BFB — Bush Fire Brigade',
            'VFRS — Volunteer Fire and Rescue',
            'VFESU — Volunteer Fire and Emergency',
            'CFRS — Career Fire and Rescue',
            'PFRS — Private Fire and Rescue',
            'SESU — State Emergency Service',
            'VMRS — Volunteer Marine Rescue',
            'DFES — DFES offices and support',
        ]);
        expect(entries.some(entry => entry?.includes('Response Coverage'))).toBe(false);
        expect(legend?.querySelector('.map-legend__swatch--boundary')).not.toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--response-green')).toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--response-yellow')).toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--response-orange')).toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--response-red')).toBeNull();
        expect(legend?.querySelector('.map-legend__swatch--response-unreachable')).toBeNull();
    });

    it('only shows entries for visible layers', () => {
        const container = renderMapView({
            status: 'Ready',
            loading: false,
            layerVisibility: {
                roads: false,
                boundaries: true,
                facilities: true,
                dfesStations: false,
                responseCoverage: false,
                fireResponseCoverage: false,
            },
            onLayerVisibilityChange: vi.fn(),
        });
        const entries = [...container.querySelectorAll('.map-legend__item')]
            .map(entry => entry.textContent?.trim());

        expect(entries).toEqual([
            'LGA Boundaries',
            'Police Station',
            'District Office',
            'Multi Functional Police Facility',
            'Multi-Jurisdictional Police Facility',
            'Police Headquarters',
        ]);
        expect(container.querySelectorAll('.map-legend__separator')).toHaveLength(1);
        expect(container.querySelector('.map-legend__list')?.nextElementSibling?.className).toBe('map-legend__separator');
    });

    it('updates when a layer is toggled', () => {
        const props = {
            status: 'Ready',
            loading: false,
            layerVisibility: {
                roads: false,
                boundaries: false,
                facilities: false,
                dfesStations: false,
                responseCoverage: true,
                fireResponseCoverage: false,
            },
            onLayerVisibilityChange: vi.fn(),
        };
        const container = renderMapView(props);
        const responseEntries = () => [...container.querySelectorAll('.map-legend__item')]
            .filter(entry => entry.textContent?.startsWith('Police Response Coverage'));

        expect(responseEntries()).toHaveLength(5);
        expect(container.querySelector('.map-legend__separator')).toBeNull();

        act(() => roots[0].render(createElement(MapView, {
            ...props,
            layerVisibility: { ...props.layerVisibility, responseCoverage: false },
        })));

        expect(responseEntries()).toHaveLength(0);
        expect(container.querySelector('.map-legend__empty')?.textContent).toBe('No layers visible');
    });

    it('colours police and DFES legend swatches by type and hides them with the layer', () => {
        const props = {
            status: 'Ready',
            loading: false,
            layerVisibility: {
                roads: false,
                boundaries: false,
                facilities: true,
                dfesStations: true,
                responseCoverage: false,
                fireResponseCoverage: true,
            },
            onLayerVisibilityChange: vi.fn(),
        };
        const container = renderMapView(props);
        const swatchFor = (label: string) => [...container.querySelectorAll('.map-legend__item')]
            .find(entry => entry.textContent?.trim() === label)
            ?.querySelector('.map-legend__swatch');

        expect(swatchFor('Police Station')?.getAttribute('style')).toContain('background-color: rgb(0, 51, 161)');
        expect(swatchFor('District Office')?.getAttribute('style')).toContain('background-color: rgb(3, 155, 229)');
        expect(swatchFor('BFB — Bush Fire Brigade')?.getAttribute('style')).toContain('background-color: rgb(230, 168, 23)');
        expect(swatchFor('CFRS — Career Fire and Rescue')?.getAttribute('style')).toContain('background-color: rgb(183, 28, 28)');
        expect([...container.querySelectorAll('.map-legend__item')]
            .filter(entry => entry.textContent?.startsWith('Fire Response Coverage'))).toHaveLength(5);

        act(() => roots[0].render(createElement(MapView, {
            ...props,
            layerVisibility: { ...props.layerVisibility, facilities: false, dfesStations: false, fireResponseCoverage: false },
        })));

        expect(container.querySelector('.map-legend__empty')?.textContent).toBe('No layers visible');
    });

    it('opens the legend when the map panel is opened without a layer list', () => {
        const container = renderMapView({ status: 'Ready', loading: false });
        const panel = container.querySelector('.map-tools') as HTMLDetailsElement;
        const legend = container.querySelector('.map-legend') as HTMLDetailsElement;

        act(() => panel.querySelector('summary')?.click());

        expect(panel.open).toBe(true);
        expect(legend.open).toBe(true);
    });

    it('collapses and expands when the title is clicked', () => {
        const container = renderMapView({ status: 'Ready', loading: false });
        const legend = container.querySelector('.map-legend') as HTMLDetailsElement;
        const summary = legend.querySelector('summary');

        expect(legend.open).toBe(false);
        act(() => summary?.click());
        expect(legend.open).toBe(true);
        act(() => summary?.click());
        expect(legend.open).toBe(false);
    });
});