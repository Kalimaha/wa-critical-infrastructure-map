import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import * as pmtiles from 'pmtiles';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const PMTILES_URL = 'https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/Road_network.pmtiles';
const protocol = new pmtiles.Protocol();
maplibregl.setWorkerUrl(maplibreWorkerUrl);
maplibregl.addProtocol('pmtiles', protocol.tile);

// Thin lines are almost impossible to hit with a mouse (and worse with a finger),
// so every line/polygon outline also gets an invisible, much wider "hit area" layer
// and pointer queries fall back to progressively larger search boxes.
const HIT_AREA_WIDTH = ['interpolate', ['linear'], ['zoom'], 5, 12, 14, 18, 18, 24];
const HIGHLIGHT_WIDTH = ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 5, 14, 7, 18, 10];
const PICK_RADII_PX = [0, 4, 8, 12];
const MAX_PICK_RADIUS_PX = PICK_RADII_PX[PICK_RADII_PX.length - 1];
const HIGHLIGHT_COLOR = '#ff6d00';
// A filter that never matches: used to keep the highlight layer empty.
const NO_FEATURE = ['boolean', false];
const GEOMETRY_PRIORITY = { Point: 0, MultiPoint: 0, LineString: 1, MultiLineString: 1 };

function pickBox(point, radius) {
    if (radius <= 0) return point;
    return [
        [point.x - radius, point.y - radius],
        [point.x + radius, point.y + radius],
    ];
}

// Smaller targets win so a road is still selectable when it crosses a large polygon.
function geometryPriority(feature) {
    return GEOMETRY_PRIORITY[feature.geometry?.type] ?? 2;
}

// Query at the exact pointer position first, then widen the search box until
// something is found: the closest feature to the pointer wins.
function pickFeatureNear(map, point, layers) {
    if (!layers.length) return null;
    for (const radius of PICK_RADII_PX) {
        const features = map.queryRenderedFeatures(pickBox(point, radius), { layers });
        if (features.length) {
            return features.reduce(
                (best, feature) => (geometryPriority(feature) < geometryPriority(best) ? feature : best),
            );
        }
    }
    return null;
}

// Builds a filter that isolates the clicked feature. Vector tiles do not always
// carry feature ids, so fall back to matching on the feature properties.
function featureMatchFilter(feature) {
    if (feature.id != null) return ['==', ['id'], feature.id];
    const conditions = Object.entries(feature.properties ?? {})
        .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
        .map(([key, value]) => ['==', ['get', key], value]);
    return conditions.length ? ['all', ...conditions] : null;
}

// Cheaper check for cursor feedback: a single query at the largest tolerance.
function hasFeatureNear(map, point, layers) {
    return layers.length > 0
        && map.queryRenderedFeatures(pickBox(point, MAX_PICK_RADIUS_PX), { layers }).length > 0;
}

function createFeaturePopup(feature) {
    const content = document.createElement('div');
    content.className = 'feature-popup';

    const layer = document.createElement('em');
    layer.textContent = feature.sourceLayer;
    content.append(layer);

    const table = document.createElement('table');
    for (const [key, value] of Object.entries(feature.properties ?? {})) {
        const row = table.insertRow();
        const name = row.insertCell();
        const property = row.insertCell();
        name.textContent = key;
        name.className = 'feature-popup__key';
        property.textContent = value == null ? '' : String(value);
    }
    content.append(table);
    return content;
}

function MapApp() {
    const mapContainer = useRef(null);
    const [status, setStatus] = useState('Caricamento…');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let map;
        let disposed = false;

        async function initializeMap() {
            try {
                const archive = new pmtiles.PMTiles(PMTILES_URL);
                protocol.add(archive);
                const [header, metadata] = await Promise.all([
                    archive.getHeader(),
                    archive.getMetadata(),
                ]);
                if (disposed) return;

                const isVector = header.tileType === 1;
                map = new maplibregl.Map({
                    container: mapContainer.current,
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
                map.addControl(new maplibregl.NavigationControl());
                map.addControl(new maplibregl.ScaleControl());

                map.on('load', () => {
                    if (isVector) {
                        map.addSource('data', { type: 'vector', url: `pmtiles://${PMTILES_URL}` });
                        const layers = (metadata.vector_layers ?? []).map(layer => layer.id);
                        const clickableLayers = [];
                        const highlightLayers = [];

                        layers.forEach((id, index) => {
                            const color = `hsl(${(index * 67) % 360}, 65%, 45%)`;
                            const lineFilter = ['any',
                                ['==', ['geometry-type'], 'LineString'],
                                ['==', ['geometry-type'], 'Polygon']];
                            map.addLayer({
                                id: `${id}-fill`,
                                type: 'fill',
                                source: 'data',
                                'source-layer': id,
                                filter: ['==', ['geometry-type'], 'Polygon'],
                                paint: { 'fill-color': color, 'fill-opacity': 0.4 },
                            });
                            map.addLayer({
                                id: `${id}-highlight`,
                                type: 'line',
                                source: 'data',
                                'source-layer': id,
                                filter: NO_FEATURE,
                                layout: { 'line-cap': 'round', 'line-join': 'round' },
                                paint: {
                                    'line-color': HIGHLIGHT_COLOR,
                                    'line-width': HIGHLIGHT_WIDTH,
                                    'line-opacity': 0.75,
                                },
                            });
                            map.addLayer({
                                id: `${id}-line`,
                                type: 'line',
                                source: 'data',
                                'source-layer': id,
                                filter: lineFilter,
                                paint: { 'line-color': color, 'line-width': 1 },
                            });
                            map.addLayer({
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
                            // Invisible, finger-friendly click target drawn on top of everything.
                            map.addLayer({
                                id: `${id}-hit`,
                                type: 'line',
                                source: 'data',
                                'source-layer': id,
                                filter: lineFilter,
                                layout: { 'line-cap': 'round', 'line-join': 'round' },
                                paint: {
                                    'line-color': color,
                                    'line-opacity': 0,
                                    'line-width': HIT_AREA_WIDTH,
                                },
                            });
                            highlightLayers.push(`${id}-highlight`);
                            clickableLayers.push(`${id}-fill`, `${id}-circle`, `${id}-hit`);
                        });

                        const clearHighlight = () => {
                            highlightLayers.forEach(layerId => map.setFilter(layerId, NO_FEATURE));
                        };
                        const highlightFeature = feature => {
                            clearHighlight();
                            const layerId = `${feature.sourceLayer}-highlight`;
                            const filter = featureMatchFilter(feature);
                            if (!filter || !highlightLayers.includes(layerId)) return;
                            map.setFilter(layerId, filter);
                        };

                        // A single popup is kept open at a time so it always matches the highlight.
                        let popup = null;
                        const closePopup = () => {
                            popup?.remove();
                            popup = null;
                            clearHighlight();
                        };
                        const openPopup = (feature, lngLat) => {
                            popup = new maplibregl.Popup({ maxWidth: '320px', closeOnClick: false })
                                .setLngLat(lngLat)
                                .setDOMContent(createFeaturePopup(feature))
                                .addTo(map);
                            const opened = popup;
                            opened.on('close', () => {
                                if (popup !== opened) return;
                                popup = null;
                                clearHighlight();
                            });
                        };

                        map.on('click', event => {
                            const feature = pickFeatureNear(map, event.point, clickableLayers);
                            closePopup();
                            if (!feature) return;
                            highlightFeature(feature);
                            openPopup(feature, event.lngLat);
                        });
                        map.on('mousemove', event => {
                            map.getCanvas().style.cursor =
                                hasFeatureNear(map, event.point, clickableLayers) ? 'pointer' : '';
                        });

                        setStatus(`Vettoriale · layer: ${layers.join(', ') || 'n/d'} · zoom ${header.minZoom}–${header.maxZoom}`);
                    } else {
                        map.addSource('data', {
                            type: 'raster',
                            url: `pmtiles://${PMTILES_URL}`,
                            tileSize: 256,
                        });
                        map.addLayer({ id: 'raster', type: 'raster', source: 'data' });
                        setStatus(`Raster · zoom ${header.minZoom}–${header.maxZoom}`);
                    }
                    setLoading(false);
                });

                map.on('error', event => {
                    console.error(event);
                    setStatus(`Errore: ${event.error?.message || event.message}`);
                    setLoading(false);
                });
            } catch (error) {
                console.error(error);
                if (disposed) return;
                setStatus(`Errore nel leggere il PMTiles: ${error.message}`);
                setLoading(false);
            }
        }

        initializeMap();
        return () => {
            disposed = true;
            map?.remove();
        };
    }, []);

    return (
        <div className="container-fluid px-0 map-app">
            <header className="row g-0 map-header">
                <div className="col-12">
                    <h1 className="map-header__title">
                        <i class="fa-solid fa-map-location-dot"></i>&nbsp;
                        WA Critical Infrastructure Map
                    </h1>
                </div>
            </header>
            <main className="row g-0 map-viewer">
                <div className="col-12 map-viewer__column">
                    <div className="map-viewer__canvas" ref={mapContainer} />
                </div>
                <div className="map-status" role="status" aria-live="polite">
                    {loading && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
                    <span>{status}</span>
                </div>
            </main>
        </div>
    );
}

createRoot(document.getElementById('root')).render(<MapApp />);