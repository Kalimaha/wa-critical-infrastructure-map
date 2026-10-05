import { useEffect, useRef, useState } from 'react';
import type { ExpressionSpecification, Map as MapLibreMap } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createFeaturePopup } from './featurePopup';
import { findFeatureAtPoint, type QueryGeometry } from './featureHitTest';
import { ROAD_NETWORK_TYPE_ATTRIBUTE } from './roadAttributes';

const PMTILES_URL = 'https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/Road_network.pmtiles';
const LGA_BOUNDARIES_PMTILES_URL = 'https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/LGA_Boundaries.pmtiles';

export type MapLayerGroup = 'roads' | 'boundaries';
export type MapLayerVisibility = Record<MapLayerGroup, boolean>;

const ROAD_NETWORK_STYLES = {
    crossover: { color: '#7f5539', width: 1 },
    'local road': { color: '#667085', width: 1.2 },
    'main roads controlled path': { color: '#007f73', width: 2.8 },
    'miscellaneous road': { color: '#8856a7', width: 1.6 },
    'proposed road': { color: '#9a6700', width: 2.2 },
    'state road': { color: '#c23e1d', width: 3.4 },
} as const;
const FALLBACK_ROAD_STYLE = { color: '#6d6d6d', width: 1.2 } as const;

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
    const layerGroupIdsRef = useRef<Record<MapLayerGroup, string[]>>({ roads: [], boundaries: [] });
    const [status, setStatus] = useState('Loading…');
    const [loading, setLoading] = useState(true);
    const [layerVisibility, setLayerVisibilityState] = useState<MapLayerVisibility>({
        roads: true,
        boundaries: true,
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
                protocol.add(archive);
                protocol.add(boundaryArchive);
                const [[header, metadata], [boundaryHeader, boundaryMetadata]] = await Promise.all([
                    Promise.all([archive.getHeader(), archive.getMetadata()]),
                    Promise.all([boundaryArchive.getHeader(), boundaryArchive.getMetadata()]),
                ]);
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
                        const layers = getVectorLayers(metadata);
                        const boundaryLayers = getVectorLayers(boundaryMetadata);
                        const clickableLayers: string[] = [];
                        const lineLayers: string[] = [];
                        const roadStyleLayerIds: string[] = [];
                        const boundaryStyleLayerIds: string[] = [];

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
                                paint: { 'line-color': '#155b57', 'line-width': 1.5 },
                            });
                            clickableLayers.push(lineLayer);
                            boundaryStyleLayerIds.push(lineLayer);
                        });

                        layerGroupIdsRef.current = {
                            roads: roadStyleLayerIds,
                            boundaries: boundaryStyleLayerIds,
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

                        setStatus(`Vector · roads: ${layers.length}, LGA boundaries: ${boundaryLayers.length} · zoom ${header.minZoom}–${header.maxZoom}`);
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
            layerGroupIdsRef.current = { roads: [], boundaries: [] };
            removeProtocol?.();
        };
    }, []);

    return { mapContainer, status, loading, layerVisibility, setLayerVisibility };
}
