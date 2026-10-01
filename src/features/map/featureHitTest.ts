export interface ScreenPoint {
    x: number;
    y: number;
}

export type QueryGeometry = ScreenPoint | [ScreenPoint, ScreenPoint];

export const LINE_HIT_TOLERANCE = 16;

export function getLineHitBounds(point: ScreenPoint): [ScreenPoint, ScreenPoint] {
    return [
        { x: point.x - LINE_HIT_TOLERANCE, y: point.y - LINE_HIT_TOLERANCE },
        { x: point.x + LINE_HIT_TOLERANCE, y: point.y + LINE_HIT_TOLERANCE },
    ];
}

function getLineStrings(geometry: unknown): unknown[][][] | undefined {
    if (typeof geometry !== 'object' || geometry === null || !('type' in geometry) || !('coordinates' in geometry)) {
        return undefined;
    }

    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
        return [geometry.coordinates as unknown[][]];
    }
    if (geometry.type === 'MultiLineString' && Array.isArray(geometry.coordinates)) {
        return geometry.coordinates as unknown[][][];
    }
    return undefined;
}

function getSquaredSegmentDistance(
    point: ScreenPoint,
    start: ScreenPoint,
    end: ScreenPoint,
): number {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const projection = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared));
    const nearestX = start.x + projection * deltaX;
    const nearestY = start.y + projection * deltaY;
    const distanceX = point.x - nearestX;
    const distanceY = point.y - nearestY;
    return distanceX * distanceX + distanceY * distanceY;
}

export function findNearestLineFeature<TFeature extends { geometry: unknown }>(
    point: ScreenPoint,
    features: TFeature[],
    project: (coordinate: [number, number]) => ScreenPoint,
): TFeature | undefined {
    let nearestFeature: TFeature | undefined;
    let nearestDistance = Infinity;

    for (const feature of features) {
        const lineStrings = getLineStrings(feature.geometry);
        if (!lineStrings) continue;

        let featureDistance = Infinity;
        for (const lineString of lineStrings) {
            for (let index = 1; index < lineString.length; index += 1) {
                const startCoordinate = lineString[index - 1];
                const endCoordinate = lineString[index];
                if (
                    !Array.isArray(startCoordinate)
                    || !Array.isArray(endCoordinate)
                    || typeof startCoordinate[0] !== 'number'
                    || typeof startCoordinate[1] !== 'number'
                    || typeof endCoordinate[0] !== 'number'
                    || typeof endCoordinate[1] !== 'number'
                ) {
                    continue;
                }

                featureDistance = Math.min(
                    featureDistance,
                    getSquaredSegmentDistance(
                        point,
                        project([startCoordinate[0], startCoordinate[1]]),
                        project([endCoordinate[0], endCoordinate[1]]),
                    ),
                );
            }
        }

        if (featureDistance <= LINE_HIT_TOLERANCE ** 2 && featureDistance < nearestDistance) {
            nearestFeature = feature;
            nearestDistance = featureDistance;
        }
    }

    return nearestFeature;
}

export function findFeatureAtPoint<TFeature extends { geometry: unknown; source?: string }>(
    point: ScreenPoint,
    clickableLayers: string[],
    lineLayers: string[],
    query: (geometry: QueryGeometry, layers: string[]) => TFeature[],
    project: (coordinate: [number, number]) => ScreenPoint,
): TFeature | undefined {
    const exactFeature = query(point, clickableLayers)[0];
    if (lineLayers.length === 0 || (exactFeature && exactFeature.source !== 'lga-boundaries')) {
        return exactFeature;
    }

    return findNearestLineFeature(point, query(getLineHitBounds(point), lineLayers), project)
        ?? exactFeature;
}