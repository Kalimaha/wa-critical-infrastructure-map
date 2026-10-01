import type { Preview } from '@storybook/react-vite';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../src/styles/global.css';

const preview: Preview = {
    tags: ['autodocs'],
};

export default preview;