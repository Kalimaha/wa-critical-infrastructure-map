import { describe, expect, it } from 'vitest';
import { createFeaturePopup } from './featurePopup';

describe('createFeaturePopup', () => {
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