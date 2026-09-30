import type { Ref } from 'react';

export interface MapViewProps {
    mapContainer?: Ref<HTMLDivElement> | null;
    status: string;
    loading: boolean;
}

function MapView({ mapContainer, status, loading }: MapViewProps) {
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
                <div className="map-status" role="status" aria-live="polite">
                    {loading && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
                    <span>{status}</span>
                </div>
            </main>
        </div>
    );
}

export default MapView;