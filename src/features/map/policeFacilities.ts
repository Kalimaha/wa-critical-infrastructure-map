import { VectorTile } from '@mapbox/vector-tile';
import type { Feature, Point } from 'geojson';
import type {
    CircleLayerSpecification,
    GeoJSONSource,
    GeoJSONSourceSpecification,
    Map as MapLibreMap,
    SymbolLayerSpecification,
} from 'maplibre-gl';
import type { Header, PMTiles } from 'pmtiles';
import { PbfReader } from 'pbf';

type FacilityArchiveBounds = Pick<Header, 'maxZoom' | 'minLon' | 'minLat' | 'maxLon' | 'maxLat'>;

export interface TileRange {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export function normalizePoliceFacilityFeature(feature: Feature<Point>): Feature<Point> {
    return {
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [...feature.geometry.coordinates],
        },
        properties: Object.fromEntries(Object.entries(feature.properties ?? {})),
    };
}

export function createPoliceFacilityClusterSource(
    features: Feature<Point>[],
): GeoJSONSourceSpecification {
    return {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 40,
    };
}

export function getPoliceFacilityClusterLayerIds(layerPrefix: string) {
    return {
        cluster: `${layerPrefix}-cluster`,
        count: `${layerPrefix}-count`,
        unclustered: `${layerPrefix}-unclustered`,
    };
}

export function getPoliceFacilityClusterLayers(sourceId: string, layerPrefix: string) {
    const layerIds = getPoliceFacilityClusterLayerIds(layerPrefix);
    const cluster: CircleLayerSpecification = {
        id: layerIds.cluster,
        type: 'circle',
        source: sourceId,
        filter: ['has', 'point_count'],
        paint: {
            'circle-color': '#0033A1',
            'circle-radius': ['step', ['get', 'point_count'], 10, 10, 15, 25, 18, 50, 22],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
        },
    };
    const count: SymbolLayerSpecification = {
        id: layerIds.count,
        type: 'symbol',
        source: sourceId,
        filter: ['has', 'point_count'],
        layout: {
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
    };
    const unclustered: CircleLayerSpecification = {
        id: layerIds.unclustered,
        type: 'circle',
        source: sourceId,
        filter: ['!', ['has', 'point_count']],
        paint: {
            'circle-color': '#0033A1',
            'circle-radius': 5,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
        },
    };

    return { cluster, count, unclustered };
}

export async function expandPoliceFacilityCluster(
    source: Pick<GeoJSONSource, 'getClusterExpansionZoom'>,
    map: Pick<MapLibreMap, 'easeTo'>,
    clusterId: number,
    coordinates: [number, number],
): Promise<void> {
    const zoom = await source.getClusterExpansionZoom(clusterId);
    map.easeTo({ center: coordinates, zoom, duration: 250 });
}

function longitudeToTileX(longitude: number, zoom: number): number {
    const tileCount = 2 ** zoom;
    return Math.max(0, Math.min(tileCount - 1, Math.floor((longitude + 180) / 360 * tileCount)));
}

function latitudeToTileY(latitude: number, zoom: number): number {
    const tileCount = 2 ** zoom;
    const radians = Math.max(-85.051129, Math.min(85.051129, latitude)) * Math.PI / 180;
    const mercatorY = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
    return Math.max(0, Math.min(tileCount - 1, Math.floor(mercatorY * tileCount)));
}

export function getPoliceFacilityTileRange(bounds: FacilityArchiveBounds): TileRange {
    return {
        minX: longitudeToTileX(bounds.minLon, bounds.maxZoom),
        maxX: longitudeToTileX(bounds.maxLon, bounds.maxZoom),
        minY: latitudeToTileY(bounds.maxLat, bounds.maxZoom),
        maxY: latitudeToTileY(bounds.minLat, bounds.maxZoom),
    };
}

export async function loadPoliceFacilityFeatures(
    archive: Pick<PMTiles, 'getZxy'>,
    bounds: FacilityArchiveBounds,
    sourceLayerIds: string[],
): Promise<Feature<Point>[]> {
    const zoom = bounds.maxZoom;
    const tileRange = getPoliceFacilityTileRange(bounds);
    const tileCoordinates: Array<[number, number]> = [];

    for (let x = tileRange.minX; x <= tileRange.maxX; x += 1) {
        for (let y = tileRange.minY; y <= tileRange.maxY; y += 1) {
            tileCoordinates.push([x, y]);
        }
    }

    const responses = await Promise.all(
        tileCoordinates.map(([x, y]) => archive.getZxy(zoom, x, y)),
    );
    const features = new Map<string, Feature<Point>>();

    responses.forEach((response, index) => {
        if (!response) return;
        const [x, y] = tileCoordinates[index];
        const vectorTile = new VectorTile(new PbfReader(new Uint8Array(response.data)));

        sourceLayerIds.forEach(layerId => {
            const layer = vectorTile.layers[layerId];
            if (!layer) return;

            for (let featureIndex = 0; featureIndex < layer.length; featureIndex += 1) {
                const feature = layer.feature(featureIndex).toGeoJSON(x, y, zoom);
                if (feature.geometry.type !== 'Point') continue;
                const pointFeature = normalizePoliceFacilityFeature(feature as Feature<Point>);
                features.set(JSON.stringify(pointFeature), pointFeature);
            }
        });
    });

    return [...features.values()];
}