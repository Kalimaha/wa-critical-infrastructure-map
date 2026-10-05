import { describe, expect, it } from 'vitest';
import { createFeaturePopup } from './featurePopup';

describe('createFeaturePopup', () => {
    it('shows only the formatted name for an LGA boundary', () => {
        const popup = createFeaturePopup({
            source: 'lga-boundaries',
            sourceLayer: 'LGA_Boundaries_LGATE_233_WA_GDA2020_Public',
            properties: {
                name: 'EAST PILBARA, SHIRE OF',
                abs_lga_number: 4770,
            },
        });

        expect(popup.textContent).toBe('SHIRE OF EAST PILBARA');
        expect(popup.querySelector('em, table')).toBeNull();
    });

    it('labels a road from the attributes kept in the tiles', () => {
        const popup = createFeaturePopup({
            source: 'data',
            sourceLayer: 'Road_Network',
            properties: {
                ROAD_NAME: 'Great Northern Hwy',
                COMMON_USAGE_NAME: 'Great Northern Highway',
                NETWORK_TYPE: 'State Road',
            },
        });

        expect(popup.textContent).toBe('Great Northern Hwy (State Road)');
        expect(popup.querySelector('em, table')).toBeNull();
    });

    it('falls back to common usage name when the road name is blank', () => {
        const popup = createFeaturePopup({
            source: 'data',
            properties: {
                ROAD_NAME: '   ',
                COMMON_USAGE_NAME: 'Old Haul Rd',
                NETWORK_TYPE: 'Local Road',
            },
        });

        expect(popup.textContent).toBe('Old Haul Rd (Local Road)');
    });

    it('shows the road name when the network type is missing', () => {
        const popup = createFeaturePopup({
            source: 'data',
            properties: {
                ROAD_NAME: 'Barrack St',
            },
        });

        expect(popup.textContent).toBe('Barrack St');
    });

    it('renders feature values as text and handles null properties', () => {
        const popup = createFeaturePopup({
            sourceLayer: 'roads',
            properties: {
                name: '<img src=x onerror=alert(1)>',
                lanes: 2,
                missing: null,
            },
        });

        expect(popup.querySelector('em')?.textContent).toBe('roads');
        expect(popup.querySelectorAll('tr')).toHaveLength(3);
        expect(popup.querySelector('img')).toBeNull();
        expect(popup.querySelector('tr:nth-child(1) td:nth-child(2)')?.textContent)
            .toBe('<img src=x onerror=alert(1)>');
        expect(popup.querySelector('tr:nth-child(2) td:nth-child(2)')?.textContent).toBe('2');
        expect(popup.querySelector('tr:nth-child(3) td:nth-child(2)')?.textContent).toBe('');
    });
});