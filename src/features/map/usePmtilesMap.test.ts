import { describe, expect, it, vi } from 'vitest';
import {
    applyLayerGroupVisibility,
    getRoadNetworkColor,
    getRoadNetworkColorExpression,
    getRoadNetworkWidth,
    getRoadNetworkWidthExpression,
} from './usePmtilesMap';

describe('map layer visibility', () => {
    it('toggles every style layer in a group together', () => {
        const setLayoutProperty = vi.fn();
        const map = { setLayoutProperty };

        applyLayerGroupVisibility(map, ['Road_Network-fill', 'Road_Network-line', 'Road_Network-circle'], false);

        expect(setLayoutProperty).toHaveBeenCalledTimes(3);
        expect(setLayoutProperty).toHaveBeenNthCalledWith(1, 'Road_Network-fill', 'visibility', 'none');
        expect(setLayoutProperty).toHaveBeenNthCalledWith(2, 'Road_Network-line', 'visibility', 'none');
        expect(setLayoutProperty).toHaveBeenNthCalledWith(3, 'Road_Network-circle', 'visibility', 'none');
    });

    it('restores visibility for a layer group', () => {
        const setLayoutProperty = vi.fn();

        applyLayerGroupVisibility({ setLayoutProperty }, ['lga-hit-area', 'lga-line'], true);

        expect(setLayoutProperty).toHaveBeenNthCalledWith(1, 'lga-hit-area', 'visibility', 'visible');
        expect(setLayoutProperty).toHaveBeenNthCalledWith(2, 'lga-line', 'visibility', 'visible');
    });

    it('supports the police facilities layer group', () => {
        const setLayoutProperty = vi.fn();

        applyLayerGroupVisibility({ setLayoutProperty }, ['facility-1', 'facility-2'], true);

        expect(setLayoutProperty).toHaveBeenNthCalledWith(1, 'facility-1', 'visibility', 'visible');
        expect(setLayoutProperty).toHaveBeenNthCalledWith(2, 'facility-2', 'visibility', 'visible');
    });
});

describe('road network styles', () => {
    const expectedStyles = [
        { networkType: 'Crossover', color: 'hsl(220 6% 95%)', width: 0.8 },
        { networkType: 'Local Road', color: 'hsl(220 5% 88%)', width: 0.8 },
        { networkType: 'Main Roads Controlled Path', color: 'hsl(220 4% 79%)', width: 0.8 },
        { networkType: 'Miscellaneous Road', color: 'hsl(220 4% 68%)', width: 0.8 },
        { networkType: 'Proposed Road', color: 'hsl(220 4% 56%)', width: 0.8 },
        { networkType: 'State Road', color: 'hsl(220 4% 42%)', width: 0.8 },
    ];

    it('assigns the expected color and width to each NETWORK_TYPE', () => {
        for (const { networkType, color, width } of expectedStyles) {
            expect(getRoadNetworkColor(networkType)).toBe(color);
            expect(getRoadNetworkWidth(networkType)).toBe(width);
        }
    });

    it('includes every category style in the MapLibre expressions', () => {
        const colorExpression = getRoadNetworkColorExpression() as unknown as unknown[];
        const widthExpression = getRoadNetworkWidthExpression() as unknown as unknown[];

        for (const { networkType, color, width } of expectedStyles) {
            expect(colorExpression).toContain(networkType.toLowerCase());
            expect(colorExpression).toContain(color);
            expect(widthExpression).toContain(networkType.toLowerCase());
            expect(widthExpression).toContain(width);
        }
    });

    it('normalizes values and falls back for unknown types', () => {
        expect(getRoadNetworkColor('  STATE ROAD ')).toBe(getRoadNetworkColor('State Road'));
        expect(getRoadNetworkWidth('unknown')).toBe(0.8);
    });
});
