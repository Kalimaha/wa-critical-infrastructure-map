import type { Ref, SyntheticEvent } from 'react';
import { Fragment, useState } from 'react';
import { DFES_STATION_TYPES } from './dfesStations';
import { POLICE_FACILITY_TYPES } from './policeFacilities';
import { ROAD_NETWORK_STYLES, type MapLayerGroup, type MapLayerVisibility } from './usePmtilesMap';

export interface MapViewProps {
    mapContainer?: Ref<HTMLDivElement> | null;
    status: string;
    loading: boolean;
    layerVisibility?: MapLayerVisibility;
    onLayerVisibilityChange?: (group: MapLayerGroup, visible: boolean) => void;
}

interface LegendEntry {
    label: string;
    color?: string;
    swatchModifier?: string;
}

const LEGEND_ENTRIES: Record<MapLayerGroup, LegendEntry[]> = {
    roads: Object.entries(ROAD_NETWORK_STYLES).map(([label, style]) => ({ label, color: style.color })),
    boundaries: [{ label: 'LGA Boundaries', swatchModifier: 'boundary' }],
    facilities: POLICE_FACILITY_TYPES.map(facility => ({ label: facility.type, color: facility.color })),
    dfesStations: DFES_STATION_TYPES.map(station => ({
        label: `${station.type} — ${station.label}`,
        color: station.color,
    })),
    responseCoverage: [
        { label: 'Police Response Coverage: under 5 min', swatchModifier: 'response-green' },
        { label: 'Police Response Coverage: 5–10 min', swatchModifier: 'response-yellow' },
        { label: 'Police Response Coverage: 10–15 min', swatchModifier: 'response-orange' },
        { label: 'Police Response Coverage: over 15 min', swatchModifier: 'response-red' },
        { label: 'Police Response Coverage: unreachable', swatchModifier: 'response-unreachable' },
    ],
    fireResponseCoverage: [
        { label: 'Fire Response Coverage: under 5 min', swatchModifier: 'response-green' },
        { label: 'Fire Response Coverage: 5–10 min', swatchModifier: 'response-yellow' },
        { label: 'Fire Response Coverage: 10–15 min', swatchModifier: 'response-orange' },
        { label: 'Fire Response Coverage: over 15 min', swatchModifier: 'response-red' },
        { label: 'Fire Response Coverage: unreachable', swatchModifier: 'response-unreachable' },
    ],
};

const LEGEND_GROUP_ORDER: MapLayerGroup[] = [
    'roads',
    'boundaries',
    'facilities',
    'dfesStations',
    'responseCoverage',
    'fireResponseCoverage',
];

function MapView({
    mapContainer,
    status,
    loading,
    layerVisibility,
    onLayerVisibilityChange,
}: MapViewProps) {
    const [toolsOpen, setToolsOpen] = useState(false);
    const [layersOpen, setLayersOpen] = useState(false);
    const [legendOpen, setLegendOpen] = useState(false);
    const [infoOpen, setInfoOpen] = useState(false);
    const [aboutOpen, setAboutOpen] = useState(false);
    const [sourcesOpen, setSourcesOpen] = useState(false);
    const visibleLegendGroups = LEGEND_GROUP_ORDER.filter(group => layerVisibility?.[group] ?? true);

    function handleToolsToggle(event: SyntheticEvent<HTMLDetailsElement>) {
        setToolsOpen(event.currentTarget.open);
    }

    function handleToolSectionClick(section: 'layers' | 'legend', event: SyntheticEvent) {
        event.preventDefault();
        if (section === 'layers') {
            const next = !layersOpen;
            setLayersOpen(next);
            if (next) {
                setLegendOpen(false);
            }
            return;
        }
        const next = !legendOpen;
        setLegendOpen(next);
        if (next) {
            setLayersOpen(false);
        }
    }

    function handleInfoToggle(event: SyntheticEvent<HTMLDetailsElement>) {
        setInfoOpen(event.currentTarget.open);
    }

    function handleSectionClick(section: 'about' | 'sources', event: SyntheticEvent) {
        event.preventDefault();
        if (section === 'about') {
            const next = !aboutOpen;
            setAboutOpen(next);
            if (next) {
                setSourcesOpen(false);
            }
            return;
        }
        const next = !sourcesOpen;
        setSourcesOpen(next);
        if (next) {
            setAboutOpen(false);
        }
    }

    return (
        <div className="map-app container-fluid d-flex flex-column h-100 overflow-hidden p-0">
            <header className="map-header flex-shrink-0">
                <h1 className="map-header__title">
                    <i className="fa-solid fa-map-location-dot" />&nbsp;
                    WA Critical Infrastructure Map
                </h1>
            </header>
            <div className="row g-0 flex-column flex-md-row flex-nowrap flex-grow-1">
                <aside className="col-12 col-md-auto order-2 order-md-1 map-panel map-panel--left flex-shrink-0 p-0">
                    <details
                        className="map-tools"
                        aria-label="Map"
                        open={toolsOpen}
                        onToggle={handleToolsToggle}
                    >
                        <summary className="map-tools__title">
                            <span className="map-tools__title-text">🗺️ Map</span>
                            <i className="fa-solid fa-chevron-down map-panel__chevron map-tools__chevron" aria-hidden="true" />
                        </summary>
                        <div className="map-tools__body">
                            {onLayerVisibilityChange && (
                                <details
                                    className="map-tools__section map-layer-control"
                                    role="group"
                                    aria-labelledby="map-layers-title"
                                    aria-disabled={loading}
                                    open={layersOpen}
                                >
                                    <summary
                                        id="map-layers-title"
                                        className="map-tools__section-title"
                                        onClick={event => handleToolSectionClick('layers', event)}
                                    >
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
                                        LGA Boundaries
                                    </label>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={layerVisibility?.facilities ?? true}
                                            onChange={event => onLayerVisibilityChange('facilities', event.currentTarget.checked)}
                                        />
                                        Police Stations
                                    </label>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={layerVisibility?.dfesStations ?? true}
                                            onChange={event => onLayerVisibilityChange('dfesStations', event.currentTarget.checked)}
                                        />
                                        DFES Stations
                                    </label>
                                    <hr className="map-layer-control__separator" />
                                    <p className="map-layer-control__section-title">Processed Layers</p>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={layerVisibility?.responseCoverage ?? true}
                                            onChange={event => onLayerVisibilityChange('responseCoverage', event.currentTarget.checked)}
                                        />
                                        Police Response Coverage
                                    </label>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={layerVisibility?.fireResponseCoverage ?? false}
                                            onChange={event => onLayerVisibilityChange('fireResponseCoverage', event.currentTarget.checked)}
                                        />
                                        Fire Response Coverage
                                    </label>
                                </details>
                            )}
                            <details
                                className="map-tools__section map-legend"
                                aria-label="Road network legend"
                                open={legendOpen}
                            >
                                <summary
                                    className="map-tools__section-title map-legend__title"
                                    onClick={event => handleToolSectionClick('legend', event)}
                                >
                                    Legend
                                    <i className="fa-solid fa-chevron-down map-panel__chevron" aria-hidden="true" />
                                </summary>
                                {visibleLegendGroups.length > 0 ? visibleLegendGroups.map((group, index) => (
                                    <Fragment key={group}>
                                        {index > 0 && <hr className="map-legend__separator" />}
                                        <ul className="map-legend__list">
                                            {LEGEND_ENTRIES[group].map(({ label, color, swatchModifier }) => (
                                                <li key={label} className="map-legend__item">
                                                    <span
                                                        className={swatchModifier
                                                            ? `map-legend__swatch map-legend__swatch--${swatchModifier}`
                                                            : 'map-legend__swatch'}
                                                        style={color ? { backgroundColor: color } : undefined}
                                                        aria-hidden="true"
                                                    />
                                                    <span>{label}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </Fragment>
                                )) : (
                                    <p className="map-legend__empty">No layers visible</p>
                                )}
                            </details>
                        </div>
                    </details>
                </aside>
                <main className="col-12 col-md order-1 order-md-2 map-panel map-panel--center flex-grow-1 p-0">
                    <div className="map-viewer__column">
                        <div className="map-viewer__canvas" ref={mapContainer} />
                    </div>
                    {(loading || status.startsWith('Error')) && (
                        <div className="map-status" role="status" aria-live="polite">
                            {loading && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
                            <span>{status}</span>
                        </div>
                    )}
                </main>
            <aside className="col-12 col-md-auto order-3 order-md-3 map-panel map-panel--right flex-shrink-0 p-0">
                    <details
                        className="map-info"
                        aria-label="Info"
                        open={infoOpen}
                        onToggle={handleInfoToggle}
                    >
                        <summary className="map-info__title">
                            <span className="map-info__title-text">ℹ️ Info</span>
                            <i className="fa-solid fa-chevron-down map-panel__chevron map-info__chevron" aria-hidden="true" />
                        </summary>
                        <div className="map-info__body">
                            <details
                                className="map-info__section"
                                open={aboutOpen}
                            >
                                <summary
                                    className="map-info__section-title"
                                    onClick={event => handleSectionClick('about', event)}
                                >
                                    About
                                    <i className="fa-solid fa-chevron-down map-panel__chevron" aria-hidden="true" />
                                </summary>
                                <p>
                                    A study map of Western Australia&apos;s critical infrastructure. It shows the state road
                                    network, local government boundaries, police facilities, DFES stations, and estimated
                                    response times. Those times use a configurable road-speed profile and are a study
                                    estimate, not an operational service standard.
                                </p>
                            </details>
                            <details
                                className="map-info__section"
                                open={sourcesOpen}
                            >
                                <summary
                                    className="map-info__section-title"
                                    onClick={event => handleSectionClick('sources', event)}
                                >
                                    Data Sources
                                    <i className="fa-solid fa-chevron-down map-panel__chevron" aria-hidden="true" />
                                </summary>
                                <p>
                                    Raw layers are from{' '}
                                    <a href="https://data.wa.gov.au/" target="_blank" rel="noopener noreferrer">Data WA</a>.
                                    Response coverage is calculated in this project from the road network and station locations.
                                </p>
                                <ul>
                                    <li>
                                        <a href="https://catalogue.data.wa.gov.au/dataset/mrwa-road-network" target="_blank" rel="noopener noreferrer">
                                            Main Roads road network
                                        </a>
                                    </li>
                                    <li>
                                        <a href="https://catalogue.data.wa.gov.au/dataset/local-government-authority-lga-boundaries" target="_blank" rel="noopener noreferrer">
                                            LGA boundaries (LGATE-233)
                                        </a>
                                    </li>
                                    <li>Police facilities</li>
                                    <li>
                                        <a href="https://catalogue.data.wa.gov.au/dataset/dfes-stations" target="_blank" rel="noopener noreferrer">
                                            DFES stations (DFES-023)
                                        </a>
                                    </li>
                                </ul>
                            </details>
                        </div>
                    </details>
                </aside>
            </div>
            <footer className="map-attribution flex-shrink-0">
                All raw data shown on this map is from{' '}
                <a href="https://data.wa.gov.au/" target="_blank" rel="noopener noreferrer">Data WA</a>.
            </footer>
        </div>
    );
}

export default MapView;
