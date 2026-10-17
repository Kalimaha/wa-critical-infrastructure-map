import type { ExpressionSpecification } from 'maplibre-gl';

/** Mixed clusters and unknown station types share one neutral colour. */
export const DFES_CLUSTER_COLOR = '#37474F';
export const DFES_STATION_FALLBACK_COLOR = DFES_CLUSTER_COLOR;

export const DFES_STATION_TYPES = [
    { type: 'BFB', label: 'Bush Fire Brigade', color: '#E6A817' },
    { type: 'VFRS', label: 'Volunteer Fire and Rescue', color: '#D32F2F' },
    { type: 'VFESU', label: 'Volunteer Fire and Emergency', color: '#AD1457' },
    { type: 'CFRS', label: 'Career Fire and Rescue', color: '#B71C1C' },
    { type: 'PFRS', label: 'Private Fire and Rescue', color: '#6A1B9A' },
    { type: 'SESU', label: 'State Emergency Service', color: '#EF6C00' },
    { type: 'VMRS', label: 'Volunteer Marine Rescue', color: '#00838F' },
    { type: 'DFES', label: 'DFES offices and support', color: '#546E7A' },
] as const;

export function getDfesStationColorExpression(): ExpressionSpecification {
    return [
        'match',
        ['get', 'type'],
        ...DFES_STATION_TYPES.flatMap(station => [station.type, station.color]),
        DFES_STATION_FALLBACK_COLOR,
    ] as unknown as ExpressionSpecification;
}
