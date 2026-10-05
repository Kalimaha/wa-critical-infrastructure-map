import { describe, expect, it } from 'vitest';
import notebookSource from '../../../notebooks/02-geojson-to-pmtiles.ipynb?raw';
import { BOUNDARY_NAME_ATTRIBUTE, ROAD_TILE_ATTRIBUTES } from './roadAttributes';

const notebook = JSON.parse(notebookSource) as {
    cells: Array<{ cell_type: string; source: string[] }>;
};

function tippecanoeCommands(): string[] {
    return notebook.cells
        .filter(cell => cell.cell_type === 'code')
        .map(cell => cell.source.join(''))
        .filter(source => source.includes('tippecanoe_cmd'));
}

function includedAttributes(source: string): string[] {
    return [...source.matchAll(/"-y", "([^"]+)"/g)].map(match => match[1]);
}

describe('PMTiles conversion', () => {
    const [roadsCommand, boundaryCommand] = tippecanoeCommands();

    it('converts both the road network and the LGA boundaries', () => {
        expect(tippecanoeCommands()).toHaveLength(2);
        expect(roadsCommand).toContain('../data/raw/Road_Network.geojson');
        expect(boundaryCommand).toContain('LGA_Boundaries_LGATE_233_WA_GDA2020_Public.geojson');
    });

    it('keeps every road feature at the highest zoom', () => {
        expect(roadsCommand).toContain('"-zg"');
        expect(roadsCommand).toContain('"--drop-densest-as-needed"');
        expect(roadsCommand).toContain('"--extend-zooms-if-still-dropping"');
        expect(roadsCommand).toContain('"--simplify-only-low-zooms"');
    });

    it('keeps only the road attributes the map reads', () => {
        expect(includedAttributes(roadsCommand)).toEqual([...ROAD_TILE_ATTRIBUTES]);
    });

    it('keeps every LGA boundary at the highest zoom', () => {
        expect(boundaryCommand).toContain('"-zg"');
        expect(boundaryCommand).toContain('"--drop-densest-as-needed"');
        expect(boundaryCommand).toContain('"--extend-zooms-if-still-dropping"');
        expect(boundaryCommand).toContain('"--simplify-only-low-zooms"');
        expect(boundaryCommand).toContain('"--no-tiny-polygon-reduction"');
        expect(boundaryCommand).toContain('"--detect-shared-borders"');
    });

    it('leaves the LGA name attribute in the tile', () => {
        expect(includedAttributes(boundaryCommand)).toEqual([]);
        expect(BOUNDARY_NAME_ATTRIBUTE).toBe('name');
    });
});
