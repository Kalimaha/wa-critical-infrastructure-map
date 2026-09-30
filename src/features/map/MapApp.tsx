import { usePmtilesMap } from './usePmtilesMap';
import MapView from './MapView';

function MapApp() {
    const { mapContainer, status, loading } = usePmtilesMap();

    return <MapView mapContainer={mapContainer} status={status} loading={loading} />;
}

export default MapApp;