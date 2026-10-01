import type { Ref } from 'react';
import type { MapLayerGroup, MapLayerVisibility } from './usePmtilesMap';

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
                {onLayerVisibilityChange && (
                    <fieldset className="map-layer-control" disabled={loading}>
                        <legend>Map layers</legend>
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
                    </fieldset>
                )}
            </main>
        </div>
    );
}

export default MapView;