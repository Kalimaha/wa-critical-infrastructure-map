import { createRoot } from 'react-dom/client';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles/global.css';
import MapApp from './features/map/MapApp';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('The root element was not found.');
}

createRoot(rootElement).render(<MapApp />);