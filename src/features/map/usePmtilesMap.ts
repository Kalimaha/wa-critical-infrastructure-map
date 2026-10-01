import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { createFeaturePopup } from './featurePopup';
import { findFeatureAtPoint, type QueryGeometry } from './featureHitTest';

const PMTILES_URL = 'https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/Road_network.pmtiles';

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

function getRoadNetworkColorExpression() {
    return [
        'match',
        ['downcase', ['get', 'NETWORK_TYPE']],
        'motorway', '#2d2d2d',
        'freeway', '#3a3a3a',
        'state highway', '#474747',
        'highway', '#5b5b5b',
        'primary', '#666666',
        'arterial', '#7a7a7a',
        'secondary', '#8a8a8a',
        'local', '#9a9a9a',
        'residential', '#a7a7a7',
        'track', '#b4b4b4',
        '#6d6d6d',
    ] as const;
}

function getRoadNetworkWidthExpression() {
    return [
        'match',
        ['downcase', ['get', 'NETWORK_TYPE']],
        'motorway', 4,
        'freeway', 3.5,
        'state highway', 3,
        'highway', 2.8,
        'primary', 2.5,
        'arterial', 2.2,
        'secondary', 1.8,
        'local', 1.4,
        'residential', 1.2,
        'track', 0.9,
        1.2,
    ] as const;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
    const [status, setStatus] = useState('Loading…');
    const [loading, setLoading] = useState(true);

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
                protocol.add(archive);
                const [header, metadata] = await Promise.all([
                    archive.getHeader(),
                    archive.getMetadata(),
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
                    bounds: [[header.minLon, header.minLat], [header.maxLon, header.maxLat]],
                    fitBoundsOptions: { padding: 20 },
                });
                map = mapInstance;
                mapInstance.addControl(new maplibregl.NavigationControl());
                mapInstance.addControl(new maplibregl.ScaleControl());

                mapInstance.on('load', () => {
                    if (isVector) {
                        mapInstance.addSource('data', { type: 'vector', url: `pmtiles://${PMTILES_URL}` });
                        const layers = getVectorLayers(metadata);
                        const clickableLayers: string[] = [];
                        const lineLayers: string[] = [];

                        layers.forEach((id, index) => {
                            const lowerId = id.toLowerCase();
                            const isRoadLayer = lowerId.includes('road') || lowerId.includes('highway');
                            const color = `hsl(${(index * 67) % 360}, 65%, 45%)`;
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
                                    'line-color': isRoadLayer ? getRoadNetworkColorExpression() : color,
                                    'line-width': isRoadLayer ? getRoadNetworkWidthExpression() : 1,
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
                            const lineLayer = `${id}-line`;
                            clickableLayers.push(`${id}-fill`, lineLayer, `${id}-circle`);
                            lineLayers.push(lineLayer);
                        });

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

                        setStatus(`Vector · layers: ${layers.join(', ') || 'n/a'} · zoom ${header.minZoom}–${header.maxZoom}`);
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
            removeProtocol?.();
        };
    }, []);

    return { mapContainer, status, loading };
}
