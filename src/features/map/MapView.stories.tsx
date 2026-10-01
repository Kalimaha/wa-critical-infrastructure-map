import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import MapApp from './MapApp';
import MapView from './MapView';

const meta = {
    title: 'Map/PMTiles Map',
    component: MapApp,
    parameters: {
        layout: 'fullscreen',
    },
} satisfies Meta<typeof MapApp>;

export default meta;
type Story = StoryObj<typeof meta>;

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