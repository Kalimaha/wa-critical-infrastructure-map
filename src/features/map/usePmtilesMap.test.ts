import { describe, expect, it } from 'vitest';
import {
    getRoadNetworkColor,
    getRoadNetworkColorExpression,
    getRoadNetworkWidth,
    getRoadNetworkWidthExpression,
} from './usePmtilesMap';

describe('road network styles', () => {
    const expectedStyles = [
        { networkType: 'Crossover', color: '#7f5539', width: 1 },
        { networkType: 'Local Road', color: '#667085', width: 1.2 },
        { networkType: 'Main Roads Controlled Path', color: '#007f73', width: 2.8 },
        { networkType: 'Miscellaneous Road', color: '#8856a7', width: 1.6 },
        { networkType: 'Proposed Road', color: '#9a6700', width: 2.2 },
        { networkType: 'State Road', color: '#c23e1d', width: 3.4 },
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
        expect(getRoadNetworkWidth('unknown')).toBe(1.2);
    });
});