import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import MapApp from './MapApp';
import MapView from './MapView';
import { createFeaturePopup, type PopupFeature } from './featurePopup';
import { getRoadNetworkColor, getRoadNetworkWidth } from './usePmtilesMap';
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
    const [visibility, setVisibility] = useState<MapLayerVisibility>({ roads: true, boundaries: true });

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
        await canvas.findByRole('region', { name: 'Map' }, { timeout: 60_000 });
        const mapCanvas = canvasElement.querySelector<HTMLCanvasElement>('.maplibregl-canvas');
        await expect(mapCanvas).not.toBeNull();
        await expect(mapCanvas?.width).toBeGreaterThan(0);
        await expect(mapCanvas?.height).toBeGreaterThan(0);
        await waitFor(() => expect(canvas.queryByRole('status')).toBeNull(), { timeout: 60_000 });
    },
};

export const RoadNetworkStyles: Story = {
    render: () => <RoadNetworkStylesPreview />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getAllByRole('listitem')).toHaveLength(7);
        await expect(canvas.getByLabelText('State Road line sample').getAttribute('style'))
            .toContain('height: 3.4px');
        await expect(canvas.getByLabelText('Unknown network type line sample').getAttribute('style'))
            .toContain('height: 1.2px');
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

export const LayerControls: Story = {
    render: () => <LayerControlsPreview />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const roads = canvas.getByRole('checkbox', { name: 'Roads' }) as HTMLInputElement;
        const boundaries = canvas.getByRole('checkbox', { name: 'LGA boundaries' }) as HTMLInputElement;

        await expect(roads.checked).toBe(true);
        await expect(boundaries.checked).toBe(true);
        await userEvent.click(roads);
        await expect(roads.checked).toBe(false);
        await expect(boundaries.checked).toBe(true);
        await userEvent.click(boundaries);
        await expect(boundaries.checked).toBe(false);
    },
};