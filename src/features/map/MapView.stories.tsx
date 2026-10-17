import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import MapApp from './MapApp';
import MapView from './MapView';
import { createFeaturePopup, type PopupFeature } from './featurePopup';
import {
    DFES_RESPONSE_COVERAGE_PMTILES_FILE,
    getDfesResponseCoveragePmtilesUrl,
    getPoliceResponseCoveragePmtilesUrl,
    getRoadNetworkColor,
    getRoadNetworkWidth,
    POLICE_RESPONSE_COVERAGE_PMTILES_FILE,
} from './usePmtilesMap';
import type { MapLayerGroup, MapLayerVisibility } from './usePmtilesMap';

const meta = {
    title: 'Map/PMTiles Map',
    component: MapApp,
    parameters: {
        layout: 'fullscreen',
    },
} satisfies Meta<typeof MapApp>;

export default meta;
type Story = StoryObj<typeof meta>;

const roadNetworkTypes = [
    { label: 'Crossover', networkType: 'Crossover' },
    { label: 'Local Road', networkType: 'Local Road' },
    { label: 'Main Roads Controlled Path', networkType: 'Main Roads Controlled Path' },
    { label: 'Miscellaneous Road', networkType: 'Miscellaneous Road' },
    { label: 'Proposed Road', networkType: 'Proposed Road' },
    { label: 'State Road', networkType: 'State Road' },
    { label: 'Unknown network type', networkType: 'not in the layer' },
];

function RoadNetworkStylesPreview() {
    return (
        <main style={{
            minHeight: '100vh',
            padding: 'clamp(20px, 5vw, 48px)',
            backgroundColor: '#f2efe9',
            color: '#242424',
            fontFamily: 'ui-sans-serif, sans-serif',
        }}>
            <section style={{ maxWidth: '700px', margin: '0 auto' }}>
                <h1 style={{ fontSize: '22px', margin: '0 0 24px' }}>Road network styling</h1>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {roadNetworkTypes.map(({ label, networkType }) => {
                        const width = getRoadNetworkWidth(networkType);
                        return (
                            <li
                                key={label}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(150px, 1fr) minmax(80px, 2fr) 55px',
                                    alignItems: 'center',
                                    gap: '14px',
                                    padding: '12px 0',
                                    borderBottom: '1px solid #d5d1c9',
                                }}
                            >
                                <span>{label}</span>
                                <span style={{ height: '18px', display: 'flex', alignItems: 'center' }}>
                                    <span
                                        aria-label={`${label} line sample`}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            height: `${width}px`,
                                            backgroundColor: getRoadNetworkColor(networkType),
                                        }}
                                    />
                                </span>
                                <code>{width} px</code>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </main>
    );
}

function FeaturePopupPreview({ feature }: { feature: PopupFeature }) {
    const popupHost = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const host = popupHost.current;
        if (!host) return;

        host.replaceChildren(createFeaturePopup(feature));
        return () => host.replaceChildren();
    }, [feature]);

    return (
        <main style={{
            minHeight: '100vh',
            padding: '48px',
            backgroundColor: '#f2efe9',
            color: '#242424',
            fontFamily: 'ui-sans-serif, sans-serif',
        }}>
            <div className="maplibregl-popup-content" style={{ width: 'fit-content', maxWidth: 'min(440px, calc(100vw - 48px))' }}>
                <div ref={popupHost} />
            </div>
        </main>
    );
}

function LayerControlsPreview() {
    const [visibility, setVisibility] = useState<MapLayerVisibility>({
        roads: true,
        boundaries: true,
        facilities: true,
        dfesStations: true,
        responseCoverage: false,
        fireResponseCoverage: false,
    });

    function handleVisibilityChange(group: MapLayerGroup, visible: boolean) {
        setVisibility(current => ({ ...current, [group]: visible }));
    }

    return (
        <MapView
            status="Vector layers ready"
            loading={false}
            layerVisibility={visibility}
            onLayerVisibilityChange={handleVisibilityChange}
        />
    );
}

export const Loading: Story = {
    render: () => <MapView mapContainer={null} status="Loading…" loading />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const status = canvas.getByRole('status');

        await expect(status.textContent).toContain('Loading');
        await expect(status.querySelector('.fa-spinner')).not.toBeNull();
    },
};

export const Ready: Story = {
    render: () => <MapApp />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Assert chrome only — do not wait on MapLibre/PMTiles (coverage `_r5` or
        // `/pmtiles` proxy). Live tile load is flaky in Storybook CI.
        await expect(POLICE_RESPONSE_COVERAGE_PMTILES_FILE).toBe('Police_Response_Coverage_r5.pmtiles');
        await expect(getPoliceResponseCoveragePmtilesUrl('https://example.test')).toContain(
            'Police_Response_Coverage_r5.pmtiles',
        );
        await expect(DFES_RESPONSE_COVERAGE_PMTILES_FILE).toBe('DFES_Response_Coverage.pmtiles');
        await expect(getDfesResponseCoveragePmtilesUrl('https://example.test')).toContain(
            'DFES_Response_Coverage.pmtiles',
        );
        await expect(canvas.getByRole('heading', { name: /WA Critical Infrastructure Map/ })).toBeTruthy();
        await expect(canvas.getByRole('group', { name: 'Layers' })).toBeTruthy();
        await expect(canvas.getByRole('checkbox', { name: 'Roads' })).toBeTruthy();
        const dfesStations = canvas.getByRole('checkbox', { name: 'DFES Stations' }) as HTMLInputElement;
        await expect(dfesStations.checked).toBe(true);
        const responseCoverage = canvas.getByRole('checkbox', { name: 'Police Response Coverage' }) as HTMLInputElement;
        await expect(responseCoverage).toBeTruthy();
        await expect(responseCoverage.checked).toBe(false);
        const fireResponseCoverage = canvas.getByRole('checkbox', { name: 'Fire Response Coverage' }) as HTMLInputElement;
        await expect(fireResponseCoverage.checked).toBe(false);
        await expect(canvas.getByLabelText('Road network legend')).toBeTruthy();
        await waitFor(() => {
            const status = canvas.queryByRole('status');
            if (!status) return;
            expect(status.querySelector('.fa-spinner')).toBeNull();
        }, { timeout: 15_000 });
    },
};

export const RoadNetworkStyles: Story = {
    render: () => <RoadNetworkStylesPreview />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getAllByRole('listitem')).toHaveLength(7);
        await expect(canvas.getByLabelText('State Road line sample').getAttribute('style'))
            .toContain('height: 0.8px');
        await expect(canvas.getByLabelText('Unknown network type line sample').getAttribute('style'))
            .toContain('height: 0.8px');
    },
};

export const RoadFeaturePopup: Story = {
    render: () => (
        <FeaturePopupPreview feature={{
            source: 'data',
            sourceLayer: 'Road_Network',
            properties: {
                ROAD_NAME: 'Great Northern Hwy',
                COMMON_USAGE_NAME: 'Great Northern Highway',
                NETWORK_TYPE: 'State Road',
            },
        }} />
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Great Northern Hwy (State Road)')).toBeTruthy();
        await expect(canvas.queryByRole('table')).toBeNull();
        await expect(canvas.queryByText('Road_Network')).toBeNull();
    },
};

export const RoadFeaturePopupCommonUsage: Story = {
    render: () => (
        <FeaturePopupPreview feature={{
            source: 'data',
            sourceLayer: 'Road_Network',
            properties: {
                ROAD_NAME: '   ',
                COMMON_USAGE_NAME: 'Old Haul Rd',
                NETWORK_TYPE: 'Local Road',
            },
        }} />
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Old Haul Rd (Local Road)')).toBeTruthy();
        await expect(canvas.queryByRole('table')).toBeNull();
    },
};

export const BoundaryFeaturePopup: Story = {
    render: () => (
        <FeaturePopupPreview feature={{
            source: 'lga-boundaries',
            sourceLayer: 'LGA_Boundaries_LGATE_233_WA_GDA2020_Public',
            properties: {
                name: 'EAST PILBARA, SHIRE OF',
                abs_lga_number: 4770,
            },
        }} />
    ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('SHIRE OF EAST PILBARA')).toBeTruthy();
        await expect(canvas.queryByRole('table')).toBeNull();
        await expect(canvas.queryByText('LGA_Boundaries_LGATE_233_WA_GDA2020_Public')).toBeNull();
    },
};

export const MapLayers: Story = {
    render: () => <LayerControlsPreview />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const control = canvas.getByRole('group', { name: 'Layers' }) as HTMLDetailsElement;
        const roads = canvas.getByRole('checkbox', { name: 'Roads' }) as HTMLInputElement;
        const boundaries = canvas.getByRole('checkbox', { name: 'LGA Boundaries' }) as HTMLInputElement;
        const facilities = canvas.getByRole('checkbox', { name: 'Police Stations' }) as HTMLInputElement;
        const dfesStations = canvas.getByRole('checkbox', { name: 'DFES Stations' }) as HTMLInputElement;
        const responseCoverage = canvas.getByRole('checkbox', { name: 'Police Response Coverage' }) as HTMLInputElement;
        const fireResponseCoverage = canvas.getByRole('checkbox', { name: 'Fire Response Coverage' }) as HTMLInputElement;

        await expect(control.textContent).toContain('Layers');
        await expect(control.open).toBe(true);
        await expect(roads.checked).toBe(true);
        await expect(boundaries.checked).toBe(true);
        await expect(facilities.checked).toBe(true);
        await expect(dfesStations.checked).toBe(true);
        await expect(responseCoverage.checked).toBe(false);
        await expect(fireResponseCoverage.checked).toBe(false);
        await userEvent.click(roads);
        await expect(roads.checked).toBe(false);
        await expect(boundaries.checked).toBe(true);
        await userEvent.click(boundaries);
        await expect(boundaries.checked).toBe(false);
        await userEvent.click(facilities);
        await expect(facilities.checked).toBe(false);
        await userEvent.click(dfesStations);
        await expect(dfesStations.checked).toBe(false);
        await userEvent.click(responseCoverage);
        await expect(responseCoverage.checked).toBe(true);
        await userEvent.click(fireResponseCoverage);
        await expect(fireResponseCoverage.checked).toBe(true);

        const legend = canvas.getByLabelText('Road network legend');
        const legendText = () => within(legend).getAllByRole('listitem').map(entry => entry.textContent?.trim());
        await expect(legendText().some(entry => entry?.startsWith('Fire Response Coverage'))).toBe(true);
        await expect(legendText().some(entry => entry?.startsWith('BFB'))).toBe(false);

        await userEvent.click(facilities);
        await userEvent.click(dfesStations);
        await expect(legendText()).toContain('Police Station');
        await expect(legendText()).toContain('BFB — Bush Fire Brigade');
        await userEvent.click(dfesStations);
        await expect(legendText().some(entry => entry?.startsWith('BFB'))).toBe(false);
        await expect(legendText()).toContain('Police Station');

        await userEvent.click(canvas.getByText('Layers'));
        await expect(control.open).toBe(false);
        await userEvent.click(canvas.getByText('Layers'));
        await expect(control.open).toBe(true);
    },
};

export const Info: Story = {
    render: () => <MapView mapContainer={null} status="Ready" loading={false} />,
    play: async ({ canvasElement }) => {
        const panel = canvasElement.querySelector('.map-info') as HTMLDetailsElement;
        const center = canvasElement.querySelector('.map-panel--center');
        const sections = () => [...panel.querySelectorAll<HTMLDetailsElement>('.map-info__section')];

        await expect(center?.querySelector('.map-legend')).toBeTruthy();
        await expect(center?.querySelector('.map-layer-control')).toBeNull();
        await expect(center?.contains(panel)).toBe(false);
        await expect(panel.open).toBe(false);
        await expect(panel.querySelector('.map-info__title-text')?.textContent).toBe('ℹ️ Info');

        await userEvent.click(within(panel).getByText('ℹ️ Info'));
        await expect(panel.open).toBe(true);
        await expect(sections().map(section => section.querySelector('summary')?.textContent?.trim())).toEqual([
            'About',
            'Data Sources',
        ]);

        await userEvent.click(within(sections()[0]).getByText('About'));
        await expect(sections()[0].open).toBe(true);
        await expect(sections()[0].textContent).toContain('study map');
        await expect(sections()[1].open).toBe(false);

        await userEvent.click(within(sections()[1]).getByText('Data Sources'));
        await expect(sections()[0].open).toBe(false);
        await expect(sections()[1].open).toBe(true);
        await expect(sections()[1].textContent).toContain('DFES stations (DFES-023)');
    },
};

export const Legend: Story = {
    render: () => <MapView mapContainer={null} status="Vector layers ready" loading={false} />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const legend = canvas.getByLabelText('Road network legend') as HTMLDetailsElement;
        const entries = within(legend).getAllByRole('listitem');

        await expect(within(legend).getByText('Legend')).toBeTruthy();
        await expect(legend.open).toBe(true);
        await expect(entries.map(entry => entry.textContent?.trim())).toEqual([
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
            'Police Response Coverage: under 5 min',
            'Police Response Coverage: 5–10 min',
            'Police Response Coverage: 10–15 min',
            'Police Response Coverage: over 15 min',
            'Police Response Coverage: unreachable',
            'Fire Response Coverage: under 5 min',
            'Fire Response Coverage: 5–10 min',
            'Fire Response Coverage: 10–15 min',
            'Fire Response Coverage: over 15 min',
            'Fire Response Coverage: unreachable',
        ]);

        await userEvent.click(within(legend).getByText('Legend'));
        await expect(legend.open).toBe(false);
        await userEvent.click(within(legend).getByText('Legend'));
        await expect(legend.open).toBe(true);
    },
};

export const PoliceFacilitiesClusters: Story = {
    render: () => <MapApp />,
    parameters: {
        docs: {
            description: {
                story: 'Police facility points aggregate into navy count badges at overview zoom. Individual points are coloured by facility type, and clicking a badge zooms to the cluster.',
            },
        },
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Same as Ready: assert facilities control without waiting on PMTiles.
        await expect(canvas.getByRole('checkbox', { name: 'Police Stations' })).toBeTruthy();
        await expect(canvas.getByRole('group', { name: 'Layers' })).toBeTruthy();
        await expect(canvas.getByRole('heading', { name: /WA Critical Infrastructure Map/ })).toBeTruthy();
        await waitFor(() => {
            const status = canvas.queryByRole('status');
            if (!status) return;
            expect(status.querySelector('.fa-spinner')).toBeNull();
        }, { timeout: 15_000 });
    },
};