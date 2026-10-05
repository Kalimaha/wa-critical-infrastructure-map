import { useEffect, useRef, useState } from 'react';
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createFeaturePopup } from './featurePopup';
import { findFeatureAtPoint, type QueryGeometry } from './featureHitTest';
import {
    createPoliceFacilityClusterSource,
    expandPoliceFacilityCluster,
    getPoliceFacilityClusterLayers,
    loadPoliceFacilityFeatures,
} from './policeFacilities';
import { ROAD_NETWORK_TYPE_ATTRIBUTE } from './roadAttributes';

const PMTILES_URL = 'https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/Road_network.pmtiles';
const LGA_BOUNDARIES_PMTILES_URL = 'https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/LGA_Boundaries.pmtiles';
const POLICE_FACILITIES_PMTILES_URL = 'https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/Police_Facilities.pmtiles';

export type MapLayerGroup = 'roads' | 'boundaries' | 'facilities';
export type MapLayerVisibility = Record<MapLayerGroup, boolean>;

const ROAD_WIDTH = 0.8;

export const ROAD_NETWORK_STYLES = {
    crossover: { color: 'hsl(220 6% 95%)', width: ROAD_WIDTH },
    'local road': { color: 'hsl(220 5% 88%)', width: ROAD_WIDTH },
    'main roads controlled path': { color: 'hsl(220 4% 79%)', width: ROAD_WIDTH },
    'miscellaneous road': { color: 'hsl(220 4% 68%)', width: ROAD_WIDTH },
    'proposed road': { color: 'hsl(220 4% 56%)', width: ROAD_WIDTH },
    'state road': { color: 'hsl(220 4% 42%)', width: ROAD_WIDTH },
} as const;
export const FALLBACK_ROAD_STYLE = { color: 'hsl(220 4% 82%)', width: ROAD_WIDTH } as const;

function getVectorLayers(metadata: unknown): string[] {
    if (typeof metadata !== 'object' || metadata === null || !('vector_layers' in metadata)) {
        return [];
    }

    const vectorLayers = metadata.vector_layers;
    if (!Array.isArray(vectorLayers)) {
        return [];
    }

    return vectorLayers.flatMap(layer => {
        if (
            typeof layer === 'object'
            && layer !== null
            && 'id' in layer
            && typeof layer.id === 'string'
        ) {
            return [layer.id];
        }
        return [];
    });
}

export function isRoadLayer(layerId: string): boolean {
    const normalized = layerId.toLowerCase();
    return normalized.includes('road') || normalized.includes('highway');
}

export function getRoadNetworkColor(value: string | null | undefined): string {
    const normalized = value?.trim().toLowerCase() ?? '';
    return ROAD_NETWORK_STYLES[normalized as keyof typeof ROAD_NETWORK_STYLES]?.color
        ?? FALLBACK_ROAD_STYLE.color;
}

export function getRoadNetworkWidth(value: string | null | undefined): number {
    const normalized = value?.trim().toLowerCase() ?? '';
    return ROAD_NETWORK_STYLES[normalized as keyof typeof ROAD_NETWORK_STYLES]?.width
        ?? FALLBACK_ROAD_STYLE.width;
}

function getRoadNetworkMatchExpression(property: 'color' | 'width'): ExpressionSpecification {
    const matchPairs = Object.entries(ROAD_NETWORK_STYLES).flatMap(([networkType, style]) => [
        networkType,
        style[property],
    ]);
    return [
        'match',
        ['downcase', ['get', ROAD_NETWORK_TYPE_ATTRIBUTE]],
        ...matchPairs,
        FALLBACK_ROAD_STYLE[property],
    ] as unknown as ExpressionSpecification;
}

export function getRoadNetworkColorExpression() {
    return getRoadNetworkMatchExpression('color');
}

export function getRoadNetworkWidthExpression() {
    return getRoadNetworkMatchExpression('width');
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function applyLayerGroupVisibility(
    map: Pick<MapLibreMap, 'setLayoutProperty'>,
    layerIds: string[],
    visible: boolean,
): void {
    const visibility = visible ? 'visible' : 'none';
    layerIds.forEach(layerId => map.setLayoutProperty(layerId, 'visibility', visibility));
}

function queryMapFeatures(map: MapLibreMap, geometry: QueryGeometry, layers: string[]) {
    if (Array.isArray(geometry)) {
        const bounds: [[number, number], [number, number]] = [
            [geometry[0].x, geometry[0].y],
            [geometry[1].x, geometry[1].y],
        ];
        return map.queryRenderedFeatures(bounds, { layers });
    }

    const point: [number, number] = [geometry.x, geometry.y];
    return map.queryRenderedFeatures(point, { layers });
}

export function usePmtilesMap() {
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const layerGroupIdsRef = useRef<Record<MapLayerGroup, string[]>>({ roads: [], boundaries: [], facilities: [] });
    const [status, setStatus] = useState('Loading…');
    const [loading, setLoading] = useState(true);
    const [layerVisibility, setLayerVisibilityState] = useState<MapLayerVisibility>({
        roads: true,
        boundaries: true,
        facilities: true,
    });

    function setLayerVisibility(group: MapLayerGroup, visible: boolean) {
        const mapInstance = mapRef.current;
        if (!mapInstance) return;

        applyLayerGroupVisibility(mapInstance, layerGroupIdsRef.current[group], visible);
        setLayerVisibilityState(current => ({ ...current, [group]: visible }));
    }

    useEffect(() => {
        let map: MapLibreMap | undefined;
        let removeProtocol: (() => void) | undefined;
        let disposed = false;

        async function initializeMap() {
            try {
                const [maplibregl, pmtiles] = await Promise.all([
                    import('maplibre-gl'),
                    import('pmtiles'),
                ]);
                if (disposed) return;

                const protocol = new pmtiles.Protocol();
                maplibregl.setWorkerUrl(maplibreWorkerUrl);
                maplibregl.addProtocol('pmtiles', protocol.tile);
                removeProtocol = () => maplibregl.removeProtocol('pmtiles');

                const archive = new pmtiles.PMTiles(PMTILES_URL);
                const boundaryArchive = new pmtiles.PMTiles(LGA_BOUNDARIES_PMTILES_URL);
                const policeFacilitiesArchive = new pmtiles.PMTiles(POLICE_FACILITIES_PMTILES_URL);
                protocol.add(archive);
                protocol.add(boundaryArchive);
                const [[header, metadata], [boundaryHeader, boundaryMetadata], [facilityHeader, facilityMetadata]] = await Promise.all([
                    Promise.all([archive.getHeader(), archive.getMetadata()]),
                    Promise.all([boundaryArchive.getHeader(), boundaryArchive.getMetadata()]),
                    Promise.all([policeFacilitiesArchive.getHeader(), policeFacilitiesArchive.getMetadata()]),
                ]);
                const facilityLayerIds = getVectorLayers(facilityMetadata);
                const policeFacilityFeatures = await loadPoliceFacilityFeatures(
                    policeFacilitiesArchive,
                    facilityHeader,
                    facilityLayerIds,
                );
                const container = mapContainer.current;
                if (disposed || !container) return;

                const isVector = header.tileType === 1;
                const mapInstance = new maplibregl.Map({
                    container,
                    style: {
                        version: 8,
                        sources: {},
                        layers: [{
                            id: 'bg',
                            type: 'background',
                            paint: { 'background-color': '#f2efe9' },
                        }],
                    },
                    bounds: [
                        [Math.min(header.minLon, boundaryHeader.minLon), Math.min(header.minLat, boundaryHeader.minLat)],
                        [Math.max(header.maxLon, boundaryHeader.maxLon), Math.max(header.maxLat, boundaryHeader.maxLat)],
                    ],
                    fitBoundsOptions: { padding: 20 },
                });
                map = mapInstance;
                mapRef.current = mapInstance;
                mapInstance.addControl(new maplibregl.NavigationControl());
                mapInstance.addControl(new maplibregl.ScaleControl());

                mapInstance.on('load', () => {
                    if (isVector) {
                        mapInstance.addSource('data', { type: 'vector', url: `pmtiles://${PMTILES_URL}` });
                        mapInstance.addSource('lga-boundaries', {
                            type: 'vector',
                            url: `pmtiles://${LGA_BOUNDARIES_PMTILES_URL}`,
                        });
                        mapInstance.addSource('police-facilities-cluster', {
                            ...createPoliceFacilityClusterSource(policeFacilityFeatures),
                        });
                        const layers = getVectorLayers(metadata);
                        const boundaryLayers = getVectorLayers(boundaryMetadata);
                        const clickableLayers: string[] = [];
                        const lineLayers: string[] = [];
                        const roadStyleLayerIds: string[] = [];
                        const boundaryStyleLayerIds: string[] = [];
                        const facilityStyleLayerIds: string[] = [];

                        boundaryLayers.forEach((id, index) => {
                            const fillLayer = `lga-boundary-${index}-hit-area`;
                            mapInstance.addLayer({
                                id: fillLayer,
                                type: 'fill',
                                source: 'lga-boundaries',
                                'source-layer': id,
                                filter: ['==', ['geometry-type'], 'Polygon'],
                                paint: { 'fill-opacity': 0 },
                            });
                            clickableLayers.push(fillLayer);
                            boundaryStyleLayerIds.push(fillLayer);
                        });

                        layers.forEach((id, index) => {
                            const color = `hsl(${(index * 67) % 360}, 65%, 45%)`;
                            const isRoad = isRoadLayer(id);
                            mapInstance.addLayer({
                                id: `${id}-fill`,
                                type: 'fill',
                                source: 'data',
                                'source-layer': id,
                                filter: ['==', ['geometry-type'], 'Polygon'],
                                paint: { 'fill-color': color, 'fill-opacity': 0.4 },
                            });
                            mapInstance.addLayer({
                                id: `${id}-line`,
                                type: 'line',
                                source: 'data',
                                'source-layer': id,
                                filter: ['any',
                                    ['==', ['geometry-type'], 'LineString'],
                                    ['==', ['geometry-type'], 'Polygon']],
                                paint: {
                                    'line-color': isRoad ? getRoadNetworkColorExpression() : color,
                                    'line-width': isRoad ? getRoadNetworkWidthExpression() : 1,
                                },
                            });
                            mapInstance.addLayer({
                                id: `${id}-circle`,
                                type: 'circle',
                                source: 'data',
                                'source-layer': id,
                                filter: ['==', ['geometry-type'], 'Point'],
                                paint: {
                                    'circle-color': color,
                                    'circle-radius': 4,
                                    'circle-stroke-width': 1,
                                    'circle-stroke-color': '#fff',
                                },
                            });
                            roadStyleLayerIds.push(`${id}-fill`, `${id}-line`, `${id}-circle`);
                            const lineLayer = `${id}-line`;
                            clickableLayers.push(`${id}-fill`, lineLayer, `${id}-circle`);
                            lineLayers.push(lineLayer);
                        });

                        boundaryLayers.forEach((id, index) => {
                            const lineLayer = `lga-boundary-${index}-line`;
                            mapInstance.addLayer({
                                id: lineLayer,
                                type: 'line',
                                source: 'lga-boundaries',
                                'source-layer': id,
                                filter: ['==', ['geometry-type'], 'Polygon'],
                                paint: { 'line-color': '#00843D', 'line-width': 1.2 },
                            });
                            clickableLayers.push(lineLayer);
                            boundaryStyleLayerIds.push(lineLayer);
                        });

                        const clusterLayers = getPoliceFacilityClusterLayers(
                            'police-facilities-cluster',
                            'police-facilities',
                        );
                        mapInstance.addLayer(clusterLayers.cluster);
                        mapInstance.addLayer(clusterLayers.count);
                        mapInstance.addLayer(clusterLayers.unclustered);
                        clickableLayers.push(clusterLayers.cluster.id, clusterLayers.unclustered.id);
                        facilityStyleLayerIds.push(
                            clusterLayers.cluster.id,
                            clusterLayers.count.id,
                            clusterLayers.unclustered.id,
                        );

                        if (policeFacilityFeatures.length === 0) {
                            console.warn('No police facility points were found in the PMTiles archive.');
                        }

                        layerGroupIdsRef.current = {
                            roads: roadStyleLayerIds,
                            boundaries: boundaryStyleLayerIds,
                            facilities: facilityStyleLayerIds,
                        };

                        mapInstance.on('click', event => {
                            const feature = findFeatureAtPoint(
                                event.point,
                                clickableLayers,
                                lineLayers,
                                (geometry, layersToQuery) => queryMapFeatures(mapInstance, geometry, layersToQuery),
                                coordinate => mapInstance.project(coordinate),
                            );
                            if (!feature) return;

                            const pointCount = feature.properties?.point_count;
                            if (typeof pointCount === 'number') {
                                const clusterId = feature.properties?.cluster_id;
                                if (typeof clusterId !== 'number') return;
                                if (feature.geometry.type !== 'Point') return;
                                const [lng, lat] = feature.geometry.coordinates;
                                const clusterSource = mapInstance.getSource('police-facilities-cluster') as GeoJSONSource | undefined;
                                if (!clusterSource) return;
                                void expandPoliceFacilityCluster(clusterSource, mapInstance, clusterId, [lng, lat]);
                                return;
                            }

                            new maplibregl.Popup({ maxWidth: 'min(460px, calc(100vw - 24px))' })
                                .setLngLat(event.lngLat)
                                .setDOMContent(createFeaturePopup(feature))
                                .addTo(mapInstance);
                        });
                        mapInstance.on('mousemove', event => {
                            mapInstance.getCanvas().style.cursor = findFeatureAtPoint(
                                event.point,
                                clickableLayers,
                                lineLayers,
                                (geometry, layersToQuery) => queryMapFeatures(mapInstance, geometry, layersToQuery),
                                coordinate => mapInstance.project(coordinate),
                            ) ? 'pointer' : '';
                        });

                        setStatus(`Vector · roads: ${layers.length}, LGA boundaries: ${boundaryLayers.length}, police facilities: ${policeFacilityFeatures.length} · zoom ${header.minZoom}–${header.maxZoom}`);
                    } else {
                        mapInstance.addSource('data', {
                            type: 'raster',
                            url: `pmtiles://${PMTILES_URL}`,
                            tileSize: 256,
                        });
                        mapInstance.addLayer({ id: 'raster', type: 'raster', source: 'data' });
                        setStatus(`Raster · zoom ${header.minZoom}–${header.maxZoom}`);
                    }
                    setLoading(false);
                });

                mapInstance.on('error', event => {
                    console.error(event);
                    setStatus(`Error: ${event.error?.message || 'Unknown error'}`);
                    setLoading(false);
                });
            } catch (error) {
                console.error(error);
                if (disposed) return;
                setStatus(`Error reading PMTiles: ${getErrorMessage(error)}`);
                setLoading(false);
            }
        }

        initializeMap();
        return () => {
            disposed = true;
            map?.remove();
            mapRef.current = null;
            layerGroupIdsRef.current = { roads: [], boundaries: [], facilities: [] };
            removeProtocol?.();
        };
    }, []);

    return { mapContainer, status, loading, layerVisibility, setLayerVisibility };
}
