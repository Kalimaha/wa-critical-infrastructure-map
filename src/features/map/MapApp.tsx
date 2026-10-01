import { usePmtilesMap } from './usePmtilesMap';
import MapView from './MapView';

function MapApp() {
    const { mapContainer, status, loading, layerVisibility, setLayerVisibility } = usePmtilesMap();

    return (
        <MapView
            mapContainer={mapContainer}
            status={status}
            loading={loading}
            layerVisibility={layerVisibility}
            onLayerVisibilityChange={setLayerVisibility}
        />
    );
}

export default MapApp;