import {
    BOUNDARY_NAME_ATTRIBUTE,
    ROAD_COMMON_USAGE_ATTRIBUTE,
    ROAD_NAME_ATTRIBUTE,
    ROAD_NETWORK_TYPE_ATTRIBUTE,
} from './roadAttributes';

export interface PopupFeature {
    source?: string;
    sourceLayer?: string;
    properties?: Record<string, unknown> | null;
}

function formatBoundaryName(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.replace(/^(.+),\s*(SHIRE OF)$/i, '$2 $1');
}

function getTextProperty(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function createFeaturePopup(feature: PopupFeature): HTMLDivElement {
    const content = document.createElement('div');
    content.className = 'feature-popup';

    if (feature.source === 'lga-boundaries') {
        const name = document.createElement('strong');
        name.textContent = formatBoundaryName(feature.properties?.[BOUNDARY_NAME_ATTRIBUTE]);
        content.append(name);
        return content;
    }

    if (feature.source === 'data') {
        const properties = feature.properties ?? {};
        const roadName = getTextProperty(properties[ROAD_NAME_ATTRIBUTE])
            || getTextProperty(properties[ROAD_COMMON_USAGE_ATTRIBUTE]);
        const networkType = getTextProperty(properties[ROAD_NETWORK_TYPE_ATTRIBUTE]);
        const label = document.createElement('strong');
        label.textContent = networkType ? `${roadName} (${networkType})` : roadName;
        content.append(label);
        return content;
    }

    const layer = document.createElement('em');
    layer.textContent = feature.sourceLayer ?? '';
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