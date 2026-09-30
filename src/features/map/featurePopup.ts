export interface PopupFeature {
    sourceLayer?: string;
    properties?: Record<string, unknown> | null;
}

export function createFeaturePopup(feature: PopupFeature): HTMLDivElement {
    const content = document.createElement('div');
    content.className = 'feature-popup';

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