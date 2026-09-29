import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as maplibregl from 'maplibre-gl';
import * as pmtiles from 'pmtiles';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';

const PMTILES_URL = 'https://wa-critical-infrastructure-map.s3.ap-southeast-2.amazonaws.com/Road_network.pmtiles';
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

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

                        layers.forEach((id, index) => {
                            const color = `hsl(${(index * 67) % 360}, 65%, 45%)`;
                            map.addLayer({
                                id: `${id}-fill`,
                                type: 'fill',
                                source: 'data',
                                'source-layer': id,
                                filter: ['==', ['geometry-type'], 'Polygon'],
                                paint: { 'fill-color': color, 'fill-opacity': 0.4 },
                            });
                            map.addLayer({
                                id: `${id}-line`,
                                type: 'line',
                                source: 'data',
                                'source-layer': id,
                                filter: ['any',
                                    ['==', ['geometry-type'], 'LineString'],
                                    ['==', ['geometry-type'], 'Polygon']],
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
                            clickableLayers.push(`${id}-fill`, `${id}-line`, `${id}-circle`);
                        });

                        map.on('click', event => {
                            const feature = map.queryRenderedFeatures(event.point, { layers: clickableLayers })[0];
                            if (!feature) return;
                            new maplibregl.Popup()
                                .setLngLat(event.lngLat)
                                .setDOMContent(createFeaturePopup(feature))
                                .addTo(map);
                        });
                        map.on('mousemove', event => {
                            map.getCanvas().style.cursor = map.queryRenderedFeatures(
                                event.point,
                                { layers: clickableLayers },
                            ).length ? 'pointer' : '';
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
        <main className="map-viewer">
            <div className="map-viewer__canvas" ref={mapContainer} />
            <div className="map-status" role="status" aria-live="polite">
                {loading && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
                <span>{status}</span>
            </div>
        </main>
    );
}

createRoot(document.getElementById('root')).render(<MapApp />);