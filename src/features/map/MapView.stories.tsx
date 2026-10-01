import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import MapApp from './MapApp';
import MapView from './MapView';
import { getRoadNetworkColor, getRoadNetworkWidth } from './usePmtilesMap';

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
    'Crossover',
    'Local Road',
    'Main Roads Controlled Path',
    'Miscellaneous Road',
    'Proposed Road',
    'State Road',
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
                    {roadNetworkTypes.map(networkType => {
                        const width = getRoadNetworkWidth(networkType);
                        return (
                            <li
                                key={networkType}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'minmax(150px, 1fr) minmax(80px, 2fr) 55px',
                                    alignItems: 'center',
                                    gap: '14px',
                                    padding: '12px 0',
                                    borderBottom: '1px solid #d5d1c9',
                                }}
                            >
                                <span>{networkType}</span>
                                <span style={{ height: '18px', display: 'flex', alignItems: 'center' }}>
                                    <span
                                        aria-label={`${networkType} line sample`}
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
        const status = await canvas.findByText(/Vector/, {}, { timeout: 60_000 });

        await expect(status.textContent).toContain('Vector');
        const mapCanvas = canvasElement.querySelector<HTMLCanvasElement>('.maplibregl-canvas');
        await expect(mapCanvas).not.toBeNull();
        await expect(mapCanvas?.width).toBeGreaterThan(0);
        await expect(mapCanvas?.height).toBeGreaterThan(0);
    },
};

export const RoadNetworkStyles: Story = {
    render: () => <RoadNetworkStylesPreview />,
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getAllByRole('listitem')).toHaveLength(6);
        await expect(canvas.getByLabelText('State Road line sample').getAttribute('style'))
            .toContain('height: 3.4px');
    },
};