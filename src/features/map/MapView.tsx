import type { Ref } from 'react';
import { ROAD_NETWORK_STYLES, type MapLayerGroup, type MapLayerVisibility } from './usePmtilesMap';

export interface MapViewProps {
    mapContainer?: Ref<HTMLDivElement> | null;
    status: string;
    loading: boolean;
    layerVisibility?: MapLayerVisibility;
    onLayerVisibilityChange?: (group: MapLayerGroup, visible: boolean) => void;
}

function MapView({
    mapContainer,
    status,
    loading,
    layerVisibility,
    onLayerVisibilityChange,
}: MapViewProps) {
    const roadLegendEntries = Object.entries(ROAD_NETWORK_STYLES).map(([label, style]) => ({
        label,
        color: style.color,
    }));

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
                <div className="map-legend" aria-label="Road network legend">
                    <div className="map-legend__title">Legend</div>
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
                    </ul>
                </div>
                {onLayerVisibilityChange && (
                    <div className="map-layer-control" role="group" aria-labelledby="map-layers-title" aria-disabled={loading}>
                        <div id="map-layers-title" className="map-layer-control__title">Map layers</div>
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
                    </div>
                )}
            </main>
        </div>
    );
}

export default MapView;