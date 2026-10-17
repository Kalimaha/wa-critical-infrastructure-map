import { describe, expect, it, vi } from 'vitest';
import {
    DFES_CLUSTER_COLOR,
    DFES_STATION_FALLBACK_COLOR,
    DFES_STATION_TYPES,
    getDfesStationColorExpression,
} from './dfesStations';
import {
    createPoliceFacilityClusterSource,
    expandPoliceFacilityCluster,
    getPoliceFacilityClusterLayerIds,
    getPoliceFacilityClusterLayers,
    getPoliceFacilityColorExpression,
    getPoliceFacilityTileRange,
    normalizePoliceFacilityFeature,
    POLICE_FACILITY_CLUSTER_COLOR,
    POLICE_FACILITY_TYPE_ATTRIBUTE,
    POLICE_FACILITY_TYPES,
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

    it('overrides cluster and unclustered circle colors when asked', () => {
        const layers = getPoliceFacilityClusterLayers('dfes-stations-cluster', 'dfes-stations', {
            cluster: DFES_CLUSTER_COLOR,
            unclustered: getDfesStationColorExpression(),
        });

        expect(layers.cluster.paint).toMatchObject({ 'circle-color': '#37474F' });
        expect(layers.unclustered.paint).toMatchObject({
            'circle-color': getDfesStationColorExpression(),
        });
        expect(layers.count.paint).toMatchObject({ 'text-color': '#ffffff' });
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

describe('police facility colours', () => {
    it('maps each description to a legend colour', () => {
        expect(POLICE_FACILITY_TYPES.map(facility => [facility.type, facility.color])).toEqual([
            ['Police Station', '#0033A1'],
            ['District Office', '#039BE5'],
            ['Multi Functional Police Facility', '#00695C'],
            ['Multi-Jurisdictional Police Facility', '#5E35B1'],
            ['Police Headquarters', '#6D4C41'],
        ]);
        expect(POLICE_FACILITY_CLUSTER_COLOR).toBe('#0A1F44');
    });

    it('paints unclustered points from DESCRIPTIO, with a navy fallback', () => {
        expect(getPoliceFacilityColorExpression()).toEqual([
            'match',
            ['get', POLICE_FACILITY_TYPE_ATTRIBUTE],
            'Police Station', '#0033A1',
            'District Office', '#039BE5',
            'Multi Functional Police Facility', '#00695C',
            'Multi-Jurisdictional Police Facility', '#5E35B1',
            'Police Headquarters', '#6D4C41',
            POLICE_FACILITY_CLUSTER_COLOR,
        ]);
    });
});

describe('DFES station colours', () => {
    it('maps each station type to a legend label and colour', () => {
        expect(DFES_STATION_TYPES.map(station => [station.type, station.label, station.color])).toEqual([
            ['BFB', 'Bush Fire Brigade', '#E6A817'],
            ['VFRS', 'Volunteer Fire and Rescue', '#D32F2F'],
            ['VFESU', 'Volunteer Fire and Emergency', '#AD1457'],
            ['CFRS', 'Career Fire and Rescue', '#B71C1C'],
            ['PFRS', 'Private Fire and Rescue', '#6A1B9A'],
            ['SESU', 'State Emergency Service', '#EF6C00'],
            ['VMRS', 'Volunteer Marine Rescue', '#00838F'],
            ['DFES', 'DFES offices and support', '#546E7A'],
        ]);
        expect(DFES_CLUSTER_COLOR).toBe('#37474F');
        expect(DFES_STATION_FALLBACK_COLOR).toBe('#37474F');
    });

    it('paints unclustered points from the type property, with a neutral fallback', () => {
        expect(getDfesStationColorExpression()).toEqual([
            'match',
            ['get', 'type'],
            'BFB', '#E6A817',
            'VFRS', '#D32F2F',
            'VFESU', '#AD1457',
            'CFRS', '#B71C1C',
            'PFRS', '#6A1B9A',
            'SESU', '#EF6C00',
            'VMRS', '#00838F',
            'DFES', '#546E7A',
            '#37474F',
        ]);
    });
});