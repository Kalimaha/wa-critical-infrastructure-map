import type { Ref, SyntheticEvent } from 'react';
import { useState } from 'react';
import { ROAD_NETWORK_STYLES, type MapLayerGroup, type MapLayerVisibility } from './usePmtilesMap';

export interface MapViewProps {
    mapContainer?: Ref<HTMLDivElement> | null;
    status: string;
    loading: boolean;
    layerVisibility?: MapLayerVisibility;
    onLayerVisibilityChange?: (group: MapLayerGroup, visible: boolean) => void;
}

/** Open on desktop; collapsed on narrow viewports so the map stays readable on mobile. */
function getInitialPanelOpen() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return true;
    }
    return window.matchMedia('(min-width: 768px)').matches;
}

function MapView({
    mapContainer,
    status,
    loading,
    layerVisibility,
    onLayerVisibilityChange,
}: MapViewProps) {
    const [legendOpen, setLegendOpen] = useState(getInitialPanelOpen);
    const [layersOpen, setLayersOpen] = useState(getInitialPanelOpen);
    const roadLegendEntries = Object.entries(ROAD_NETWORK_STYLES).map(([label, style]) => ({
        label,
        color: style.color,
    }));

    function handleLegendToggle(event: SyntheticEvent<HTMLDetailsElement>) {
        setLegendOpen(event.currentTarget.open);
    }

    function handleLayersToggle(event: SyntheticEvent<HTMLDetailsElement>) {
        setLayersOpen(event.currentTarget.open);
    }

    return (
        <div className="container-fluid px-0 map-app">
            <header className="row g-0 map-header">
                <div className="col-12">
                    <h1 className="map-header__title">
                        <i className="fa-solid fa-map-location-dot" />&nbsp;
                        WA Critical Infrastructure Map
                    </h1>
                </div>
            </header>
            <main className="row g-0 map-viewer">
                <div className="col-12 map-viewer__column">
                    <div className="map-viewer__canvas" ref={mapContainer} />
                </div>
                {(loading || status.startsWith('Error')) && (
                    <div className="map-status" role="status" aria-live="polite">
                        {loading && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
                        <span>{status}</span>
                    </div>
                )}
                <details
                    className="map-legend"
                    aria-label="Road network legend"
                    open={legendOpen}
                    onToggle={handleLegendToggle}
                >
                    <summary className="map-legend__title">
                        Legend
                        <i className="fa-solid fa-chevron-down map-panel__chevron" aria-hidden="true" />
                    </summary>
                    <ul className="map-legend__list">
                        {roadLegendEntries.map(({ label, color }) => (
                            <li key={label} className="map-legend__item">
                                <span className="map-legend__swatch" style={{ backgroundColor: color }} aria-hidden="true" />
                                <span>{label}</span>
                            </li>
                        ))}
                        <li className="map-legend__item">
                            <span className="map-legend__swatch map-legend__swatch--boundary" aria-hidden="true" />
                            <span>LGA boundaries</span>
                        </li>
                        <li className="map-legend__item">
                            <span className="map-legend__swatch map-legend__swatch--facility" aria-hidden="true" />
                            <span>Police facilities</span>
                        </li>
                        <li className="map-legend__item">
                            <span className="map-legend__swatch map-legend__swatch--response-green" aria-hidden="true" />
                            <span>Response coverage: under 5 min</span>
                        </li>
                        <li className="map-legend__item">
                            <span className="map-legend__swatch map-legend__swatch--response-yellow" aria-hidden="true" />
                            <span>Response coverage: 5–10 min</span>
                        </li>
                        <li className="map-legend__item">
                            <span className="map-legend__swatch map-legend__swatch--response-orange" aria-hidden="true" />
                            <span>Response coverage: 10–15 min</span>
                        </li>
                        <li className="map-legend__item">
                            <span className="map-legend__swatch map-legend__swatch--response-red" aria-hidden="true" />
                            <span>Response coverage: over 15 min</span>
                        </li>
                        <li className="map-legend__item">
                            <span className="map-legend__swatch map-legend__swatch--response-unreachable" aria-hidden="true" />
                            <span>Response coverage: unreachable</span>
                        </li>
                    </ul>
                </details>
                {onLayerVisibilityChange && (
                    <details
                        className="map-layer-control"
                        role="group"
                        aria-labelledby="map-layers-title"
                        aria-disabled={loading}
                        open={layersOpen}
                        onToggle={handleLayersToggle}
                    >
                        <summary id="map-layers-title" className="map-layer-control__title">
                            Layers
                            <i className="fa-solid fa-chevron-down map-panel__chevron" aria-hidden="true" />
                        </summary>
                        <label>
                            <input
                                type="checkbox"
                                checked={layerVisibility?.roads ?? true}
                                onChange={event => onLayerVisibilityChange('roads', event.currentTarget.checked)}
                            />
                            Roads
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={layerVisibility?.boundaries ?? true}
                                onChange={event => onLayerVisibilityChange('boundaries', event.currentTarget.checked)}
                            />
                            LGA boundaries
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={layerVisibility?.facilities ?? true}
                                onChange={event => onLayerVisibilityChange('facilities', event.currentTarget.checked)}
                            />
                            Police facilities
                        </label>
                        <label>
                            <input
                                type="checkbox"
                                checked={layerVisibility?.responseCoverage ?? true}
                                onChange={event => onLayerVisibilityChange('responseCoverage', event.currentTarget.checked)}
                            />
                            Response coverage
                        </label>
                    </details>
                )}
            </main>
            <footer className="map-attribution">
                All raw data shown on this map is from{' '}
                <a href="https://data.wa.gov.au/" target="_blank" rel="noopener noreferrer">Data WA</a>.
            </footer>
        </div>
    );
}

export default MapView;
