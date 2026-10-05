import { describe, expect, it, vi } from 'vitest';
import {
    createPoliceFacilityClusterSource,
    expandPoliceFacilityCluster,
    getPoliceFacilityClusterLayerIds,
    getPoliceFacilityClusterLayers,
    getPoliceFacilityTileRange,
    normalizePoliceFacilityFeature,
} from './policeFacilities';

describe('police facility feature normalization', () => {
    it('converts null-prototype properties into plain JSON objects', () => {
        const properties = Object.assign(Object.create(null), { NAME: 'TEST STATION' });
        const feature = normalizePoliceFacilityFeature({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [115, -32] },
            properties,
        });

        expect(Object.getPrototypeOf(feature.properties)).toBe(Object.prototype);
        expect(feature.properties).toEqual({ NAME: 'TEST STATION' });
    });
});

describe('police facility PMTiles tile range', () => {
    it('limits tile requests to the archive bounds at its maximum zoom', () => {
        expect(getPoliceFacilityTileRange({
            maxZoom: 4,
            minLon: 113.536491,
            minLat: -35.027234,
            maxLon: 129.383001,
            maxLat: -14.292578,
        })).toEqual({ minX: 13, maxX: 13, minY: 8, maxY: 9 });
    });
});

describe('police facility clustering', () => {
    const facilities = [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [115, -32] as [number, number] },
        properties: { NAME: 'TEST STATION' },
    }];

    it('configures a clustered GeoJSON source for facility points', () => {
        expect(createPoliceFacilityClusterSource(facilities)).toEqual({
            type: 'geojson',
            data: { type: 'FeatureCollection', features: facilities },
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 40,
        });
    });

    it('defines count badges, clustered circles, and individual facility points', () => {
        const ids = getPoliceFacilityClusterLayerIds('police-facilities');
        const layers = getPoliceFacilityClusterLayers('facilities-source', 'police-facilities');

        expect(ids).toEqual({
            cluster: 'police-facilities-cluster',
            count: 'police-facilities-count',
            unclustered: 'police-facilities-unclustered',
        });
        expect(layers.cluster).toMatchObject({
            id: ids.cluster,
            type: 'circle',
            source: 'facilities-source',
            filter: ['has', 'point_count'],
            paint: { 'circle-color': '#0033A1' },
        });
        expect(layers.count).toMatchObject({
            id: ids.count,
            type: 'symbol',
            source: 'facilities-source',
            filter: ['has', 'point_count'],
            layout: { 'text-field': ['get', 'point_count_abbreviated'] },
        });
        expect(layers.unclustered).toMatchObject({
            id: ids.unclustered,
            type: 'circle',
            source: 'facilities-source',
            filter: ['!', ['has', 'point_count']],
            paint: { 'circle-color': '#0033A1', 'circle-radius': 5 },
        });
    });

    it('zooms to a cluster using MapLibre’s expansion zoom', async () => {
        const getClusterExpansionZoom = vi.fn().mockResolvedValue(9);
        const easeTo = vi.fn();

        await expandPoliceFacilityCluster(
            { getClusterExpansionZoom },
            { easeTo },
            42,
            [115, -32],
        );

        expect(getClusterExpansionZoom).toHaveBeenCalledWith(42);
        expect(easeTo).toHaveBeenCalledWith({ center: [115, -32], zoom: 9, duration: 250 });
    });
});