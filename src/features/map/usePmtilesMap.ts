import { useEffect, useRef, useState } from 'react';
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { DFES_CLUSTER_COLOR, getDfesStationColorExpression } from './dfesStations';
import { createFeaturePopup } from './featurePopup';
import { findFeatureAtPoint, type QueryGeometry } from './featureHitTest';
import {
    createPoliceFacilityClusterSource,
    expandPoliceFacilityCluster,
    getPoliceFacilityClusterLayers,
    getPoliceFacilityColorExpression,
    loadPoliceFacilityFeatures,
    POLICE_FACILITY_CLUSTER_COLOR,
} from './policeFacilities';
import { currentMapBackgroundColor, watchColorScheme } from './mapAppearance';
import { ROAD_NETWORK_TYPE_ATTRIBUTE } from './roadAttributes';

const PMTILES_BUCKET_URL = 'https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com';
// Vite dev uses `/pmtiles` proxy; Vitest/Storybook browser tests hit S3 directly
// because the configureServer proxy is not reliably available under Vitest.
const PMTILES_ORIGIN = import.meta.env.DEV && !import.meta.env.VITEST
    ? '/pmtiles'
    : PMTILES_BUCKET_URL;
const PMTILES_URL = `${PMTILES_ORIGIN}/Road_network.pmtiles`;
const LGA_BOUNDARIES_PMTILES_URL = `${PMTILES_ORIGIN}/LGA_Boundaries.pmtiles`;
const POLICE_FACILITIES_PMTILES_URL = `${PMTILES_ORIGIN}/Police_Facilities.pmtiles`;
/** Statewide R5 response-coverage archive on the S3 bucket (not the older M6 baseline). */
export const POLICE_RESPONSE_COVERAGE_PMTILES_FILE = 'Police_Response_Coverage_r5.pmtiles';

export function getPoliceResponseCoveragePmtilesUrl(origin: string = PMTILES_ORIGIN): string {
    return `${origin}/${POLICE_RESPONSE_COVERAGE_PMTILES_FILE}`;
}

const POLICE_RESPONSE_COVERAGE_PMTILES_URL = getPoliceResponseCoveragePmtilesUrl();

const DFES_STATIONS_PMTILES_URL = `${PMTILES_ORIGIN}/DFES_Stations.pmtiles`;
/** Statewide DFES response-coverage archive. */
export const DFES_RESPONSE_COVERAGE_PMTILES_FILE = 'DFES_Response_Coverage.pmtiles';

export function getDfesResponseCoveragePmtilesUrl(origin: string = PMTILES_ORIGIN): string {
    return `${origin}/${DFES_RESPONSE_COVERAGE_PMTILES_FILE}`;
}

const DFES_RESPONSE_COVERAGE_PMTILES_URL = getDfesResponseCoveragePmtilesUrl();

const RESPONSE_COVERAGE_CLASS_STYLES = [
    ['green', '#2ca84b'],
    ['yellow', '#f4c542'],
    ['orange', '#ef7d32'],
    ['red', '#c83b3b'],
    ['unreachable', '#424242'],
] as const;

const POLICE_FACILITIES_SOURCE_ID = 'police-facilities-cluster';
const DFES_STATIONS_SOURCE_ID = 'dfes-stations-cluster';

export type MapLayerGroup = 'roads' | 'boundaries' | 'facilities' | 'dfesStations' | 'responseCoverage' | 'fireResponseCoverage';
export type MapLayerVisibility = Record<MapLayerGroup, boolean>;

export const DEFAULT_LAYER_VISIBILITY: MapLayerVisibility = {
    roads: true,
    boundaries: true,
    facilities: true,
    dfesStations: true,
    responseCoverage: false,
    fireResponseCoverage: false,
};

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
    const layerGroupIdsRef = useRef<Record<MapLayerGroup, string[]>>({
        roads: [],
        boundaries: [],
        facilities: [],
        dfesStations: [],
        responseCoverage: [],
        fireResponseCoverage: [],
    });
    const [status, setStatus] = useState('Loading…');
    const [loading, setLoading] = useState(true);
    const [layerVisibility, setLayerVisibilityState] = useState<MapLayerVisibility>(DEFAULT_LAYER_VISIBILITY);
    const layerVisibilityRef = useRef(layerVisibility);

    useEffect(() => {
        layerVisibilityRef.current = layerVisibility;
    }, [layerVisibility]);

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
                // A missing DFES archive must not block Ready. Police facilities still fail the map.
                const dfesStationFeaturesPromise = (async () => {
                    try {
                        const dfesStationsArchive = new pmtiles.PMTiles(DFES_STATIONS_PMTILES_URL);
                        const [dfesHeader, dfesMetadata] = await Promise.all([
                            dfesStationsArchive.getHeader(),
                            dfesStationsArchive.getMetadata(),
                        ]);
                        const features = await loadPoliceFacilityFeatures(
                            dfesStationsArchive,
                            dfesHeader,
                            getVectorLayers(dfesMetadata),
                        );
                        if (features.length === 0) {
                            console.warn('No DFES station points were found in the PMTiles archive.');
                        }
                        return features;
                    } catch (dfesError) {
                        console.warn(dfesError);
                        return [];
                    }
                })();
                protocol.add(archive);
                protocol.add(boundaryArchive);
                const [[header, metadata], [boundaryHeader, boundaryMetadata], [facilityHeader, facilityMetadata]] = await Promise.all([
                    Promise.all([archive.getHeader(), archive.getMetadata()]),
                    Promise.all([boundaryArchive.getHeader(), boundaryArchive.getMetadata()]),
                    Promise.all([policeFacilitiesArchive.getHeader(), policeFacilitiesArchive.getMetadata()]),
                ]);
                const facilityLayerIds = getVectorLayers(facilityMetadata);
                const [policeFacilityFeatures, dfesStationFeatures] = await Promise.all([
                    loadPoliceFacilityFeatures(
                        policeFacilitiesArchive,
                        facilityHeader,
                        facilityLayerIds,
                    ),
                    dfesStationFeaturesPromise,
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
                            paint: { 'background-color': currentMapBackgroundColor() },
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
                const stopWatchingColorScheme = watchColorScheme(() => {
                    if (mapInstance.getLayer('bg')) {
                        mapInstance.setPaintProperty('bg', 'background-color', currentMapBackgroundColor());
                    }
                });
                if (disposed) {
                    stopWatchingColorScheme();
                    return;
                }
                removeSchemeListener = stopWatchingColorScheme;
                mapInstance.addControl(new maplibregl.NavigationControl());
                mapInstance.addControl(new maplibregl.ScaleControl());
                let mapSettled = false;

                mapInstance.on('load', () => {
                    if (isVector) {
                        mapInstance.addSource('data', { type: 'vector', url: `pmtiles://${PMTILES_URL}` });
                        mapInstance.addSource('lga-boundaries', {
                            type: 'vector',
                            url: `pmtiles://${LGA_BOUNDARIES_PMTILES_URL}`,
                        });
                        mapInstance.addSource(POLICE_FACILITIES_SOURCE_ID, {
                            ...createPoliceFacilityClusterSource(policeFacilityFeatures),
                        });
                        mapInstance.addSource(DFES_STATIONS_SOURCE_ID, {
                            ...createPoliceFacilityClusterSource(dfesStationFeatures),
                        });
                        const layers = getVectorLayers(metadata);
                        const boundaryLayers = getVectorLayers(boundaryMetadata);
                        const clickableLayers: string[] = [];
                        const lineLayers: string[] = [];
                        const roadStyleLayerIds: string[] = [];
                        const boundaryStyleLayerIds: string[] = [];
                        const facilityStyleLayerIds: string[] = [];
                        const dfesStyleLayerIds: string[] = [];
                        const responseCoverageStyleLayerIds: string[] = [];
                        const fireResponseCoverageStyleLayerIds: string[] = [];

                        // Response coverage is WIP/large — attach after the core map is up so
                        // a missing/bad archive cannot block Ready / Storybook CI.
                        void (async () => {
                            try {
                                const responseCoverageArchive = new pmtiles.PMTiles(POLICE_RESPONSE_COVERAGE_PMTILES_URL);
                                protocol.add(responseCoverageArchive);
                                const [, responseCoverageMetadata] = await Promise.all([
                                    responseCoverageArchive.getHeader(),
                                    responseCoverageArchive.getMetadata(),
                                ]);
                                if (disposed || !mapRef.current) return;
                                const responseCoverageLayerIds = getVectorLayers(responseCoverageMetadata);
                                mapInstance.addSource('police-response-coverage', {
                                    type: 'vector',
                                    url: `pmtiles://${POLICE_RESPONSE_COVERAGE_PMTILES_URL}`,
                                });
                                responseCoverageLayerIds.forEach((id, index) => {
                                    const responseClassLayer = `police-response-coverage-${index}`;

                                    RESPONSE_COVERAGE_CLASS_STYLES.forEach(([responseClass, color]) => {
                                        const layerId = `${responseClassLayer}-${responseClass}`;
                                        mapInstance.addLayer({
                                            id: layerId,
                                            type: 'fill',
                                            source: 'police-response-coverage',
                                            'source-layer': id,
                                            filter: ['==', ['get', 'response_class'], responseClass],
                                            paint: { 'fill-color': color, 'fill-opacity': 0.7 },
                                        }, roadStyleLayerIds[0]);
                                        clickableLayers.push(layerId);
                                        responseCoverageStyleLayerIds.push(layerId);
                                    });
                                });
                                layerGroupIdsRef.current = {
                                    ...layerGroupIdsRef.current,
                                    responseCoverage: [...responseCoverageStyleLayerIds],
                                };
                                // Layers are visible when added; honour the current toggle (off by default).
                                applyLayerGroupVisibility(
                                    mapInstance,
                                    responseCoverageStyleLayerIds,
                                    layerVisibilityRef.current.responseCoverage,
                                );
                            } catch (coverageError) {
                                console.error(coverageError);
                            }
                        })();

                        // Fire response coverage attaches the same way: a missing archive is logged, not fatal.
                        void (async () => {
                            try {
                                const fireResponseCoverageArchive = new pmtiles.PMTiles(DFES_RESPONSE_COVERAGE_PMTILES_URL);
                                protocol.add(fireResponseCoverageArchive);
                                const [, fireResponseCoverageMetadata] = await Promise.all([
                                    fireResponseCoverageArchive.getHeader(),
                                    fireResponseCoverageArchive.getMetadata(),
                                ]);
                                if (disposed || !mapRef.current) return;
                                const fireResponseCoverageLayerIds = getVectorLayers(fireResponseCoverageMetadata);
                                mapInstance.addSource('fire-response-coverage', {
                                    type: 'vector',
                                    url: `pmtiles://${DFES_RESPONSE_COVERAGE_PMTILES_URL}`,
                                });
                                fireResponseCoverageLayerIds.forEach((id, index) => {
                                    const responseClassLayer = `fire-response-coverage-${index}`;

                                    RESPONSE_COVERAGE_CLASS_STYLES.forEach(([responseClass, color]) => {
                                        const layerId = `${responseClassLayer}-${responseClass}`;
                                        mapInstance.addLayer({
                                            id: layerId,
                                            type: 'fill',
                                            source: 'fire-response-coverage',
                                            'source-layer': id,
                                            filter: ['==', ['get', 'response_class'], responseClass],
                                            paint: { 'fill-color': color, 'fill-opacity': 0.7 },
                                        }, roadStyleLayerIds[0]);
                                        clickableLayers.push(layerId);
                                        fireResponseCoverageStyleLayerIds.push(layerId);
                                    });
                                });
                                layerGroupIdsRef.current = {
                                    ...layerGroupIdsRef.current,
                                    fireResponseCoverage: [...fireResponseCoverageStyleLayerIds],
                                };
                                applyLayerGroupVisibility(
                                    mapInstance,
                                    fireResponseCoverageStyleLayerIds,
                                    layerVisibilityRef.current.fireResponseCoverage,
                                );
                            } catch (coverageError) {
                                console.error(coverageError);
                            }
                        })();

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
                            POLICE_FACILITIES_SOURCE_ID,
                            'police-facilities',
                            {
                                cluster: POLICE_FACILITY_CLUSTER_COLOR,
                                unclustered: getPoliceFacilityColorExpression(),
                            },
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

                        const dfesClusterLayers = getPoliceFacilityClusterLayers(
                            DFES_STATIONS_SOURCE_ID,
                            'dfes-stations',
                            {
                                cluster: DFES_CLUSTER_COLOR,
                                unclustered: getDfesStationColorExpression(),
                            },
                        );
                        mapInstance.addLayer(dfesClusterLayers.cluster);
                        mapInstance.addLayer(dfesClusterLayers.count);
                        mapInstance.addLayer(dfesClusterLayers.unclustered);
                        clickableLayers.push(dfesClusterLayers.cluster.id, dfesClusterLayers.unclustered.id);
                        dfesStyleLayerIds.push(
                            dfesClusterLayers.cluster.id,
                            dfesClusterLayers.count.id,
                            dfesClusterLayers.unclustered.id,
                        );

                        if (policeFacilityFeatures.length === 0) {
                            console.warn('No police facility points were found in the PMTiles archive.');
                        }

                        layerGroupIdsRef.current = {
                            roads: roadStyleLayerIds,
                            boundaries: boundaryStyleLayerIds,
                            facilities: facilityStyleLayerIds,
                            dfesStations: dfesStyleLayerIds,
                            responseCoverage: responseCoverageStyleLayerIds,
                            fireResponseCoverage: fireResponseCoverageStyleLayerIds,
                        };
                        applyLayerGroupVisibility(
                            mapInstance,
                            dfesStyleLayerIds,
                            layerVisibilityRef.current.dfesStations,
                        );

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
                                const sourceId = feature.source;
                                if (sourceId !== POLICE_FACILITIES_SOURCE_ID && sourceId !== DFES_STATIONS_SOURCE_ID) return;
                                const [lng, lat] = feature.geometry.coordinates;
                                const clusterSource = mapInstance.getSource(sourceId) as GeoJSONSource | undefined;
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

                        setStatus(`Vector · roads: ${layers.length}, LGA boundaries: ${boundaryLayers.length}, police facilities: ${policeFacilityFeatures.length}, DFES stations: ${dfesStationFeatures.length} · zoom ${header.minZoom}–${header.maxZoom}`);
                    } else {
                        mapInstance.addSource('data', {
                            type: 'raster',
                            url: `pmtiles://${PMTILES_URL}`,
                            tileSize: 256,
                        });
                        mapInstance.addLayer({ id: 'raster', type: 'raster', source: 'data' });
                        setStatus(`Raster · zoom ${header.minZoom}–${header.maxZoom}`);
                    }
                    mapSettled = true;
                    setLoading(false);
                });

                mapInstance.on('error', event => {
                    console.error(event);
                    // Ignore post-load tile errors (e.g. optional response-coverage archive)
                    // so Storybook/CI Ready checks are not stuck on a permanent Error status.
                    if (mapSettled) return;
                    mapSettled = true;
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

        let removeSchemeListener = () => {};
        initializeMap();
        return () => {
            disposed = true;
            removeSchemeListener();
            map?.remove();
            mapRef.current = null;
            layerGroupIdsRef.current = {
                roads: [],
                boundaries: [],
                facilities: [],
                dfesStations: [],
                responseCoverage: [],
                fireResponseCoverage: [],
            };
            removeProtocol?.();
        };
    }, []);

    return { mapContainer, status, loading, layerVisibility, setLayerVisibility };
}
