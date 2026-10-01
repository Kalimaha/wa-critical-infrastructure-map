import { describe, expect, it, vi } from 'vitest';
import {
    findFeatureAtPoint,
    findNearestLineFeature,
    getLineHitBounds,
    type QueryGeometry,
} from './featureHitTest';

interface TestFeature {
    geometry: { type: string; coordinates: unknown };
    name: string;
    source?: string;
}

const project = ([longitude, latitude]: [number, number]) => ({ x: longitude, y: latitude });

describe('feature hit testing', () => {
    it('creates a 32-pixel query box around the pointer', () => {
        expect(getLineHitBounds({ x: 30, y: 40 })).toEqual([
            { x: 14, y: 24 },
            { x: 46, y: 56 },
        ]);
    });

    it('preserves exact hits without querying the tolerance box', () => {
        const exactFeature: TestFeature = {
            geometry: { type: 'Point', coordinates: [30, 40] },
            name: 'exact',
        };
        const query = vi.fn(() => [exactFeature]);

        const result = findFeatureAtPoint(
            { x: 30, y: 40 },
            ['roads-line', 'stations-circle'],
            ['roads-line'],
            query,
            project,
        );

        expect(result).toBe(exactFeature);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('queries nearby line layers and chooses the nearest line', () => {
        const fartherFeature: TestFeature = {
            geometry: { type: 'LineString', coordinates: [[0, 6], [20, 6]] },
            name: 'farther',
        };
        const nearestFeature: TestFeature = {
            geometry: { type: 'MultiLineString', coordinates: [[[0, 2], [20, 2]]] },
            name: 'nearest',
        };
        const query = vi.fn((geometry: QueryGeometry) => (
            Array.isArray(geometry) ? [fartherFeature, nearestFeature] : []
        ));

        const result = findFeatureAtPoint({ x: 10, y: 0 }, ['roads-line'], ['roads-line'], query, project);

        expect(result).toBe(nearestFeature);
        expect(query).toHaveBeenNthCalledWith(1, { x: 10, y: 0 }, ['roads-line']);
        expect(query).toHaveBeenNthCalledWith(2, [{ x: -6, y: -16 }, { x: 26, y: 16 }], ['roads-line']);
    });

    it('prioritizes a nearby road over an exact boundary-area hit', () => {
        const boundaryFeature: TestFeature = {
            geometry: { type: 'Polygon', coordinates: [] },
            name: 'boundary',
            source: 'lga-boundaries',
        };
        const roadFeature: TestFeature = {
            geometry: { type: 'LineString', coordinates: [[0, 4], [20, 4]] },
            name: 'road',
            source: 'data',
        };
        const query = vi.fn((geometry: QueryGeometry) => (
            Array.isArray(geometry) ? [roadFeature] : [boundaryFeature]
        ));

        const result = findFeatureAtPoint(
            { x: 10, y: 0 },
            ['lga-boundary-hit-area'],
            ['roads-line'],
            query,
            project,
        );

        expect(result).toBe(roadFeature);
        expect(query).toHaveBeenCalledTimes(2);
    });

    it('keeps the boundary hit when no road is within tolerance', () => {
        const boundaryFeature: TestFeature = {
            geometry: { type: 'Polygon', coordinates: [] },
            name: 'boundary',
            source: 'lga-boundaries',
        };
        const distantRoadFeature: TestFeature = {
            geometry: { type: 'LineString', coordinates: [[0, 18], [20, 18]] },
            name: 'distant road',
            source: 'data',
        };
        const query = vi.fn((geometry: QueryGeometry) => (
            Array.isArray(geometry) ? [distantRoadFeature] : [boundaryFeature]
        ));

        const result = findFeatureAtPoint(
            { x: 10, y: 0 },
            ['lga-boundary-hit-area'],
            ['roads-line'],
            query,
            project,
        );

        expect(result).toBe(boundaryFeature);
    });

    it('keeps MapLibre result order when line distances tie', () => {
        const firstFeature: TestFeature = {
            geometry: { type: 'LineString', coordinates: [[0, 2], [20, 2]] },
            name: 'first',
        };
        const secondFeature: TestFeature = {
            geometry: { type: 'LineString', coordinates: [[0, -2], [20, -2]] },
            name: 'second',
        };

        expect(findNearestLineFeature({ x: 10, y: 0 }, [firstFeature, secondFeature], project)).toBe(firstFeature);
    });

    it('returns no feature when exact and nearby line queries miss', () => {
        const query = vi.fn(() => []);

        expect(findFeatureAtPoint({ x: 10, y: 10 }, ['roads-line'], ['roads-line'], query, project)).toBeUndefined();
        expect(query).toHaveBeenCalledTimes(2);
    });
});