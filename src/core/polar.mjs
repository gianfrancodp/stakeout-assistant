import { DEFAULT_EARTH_RADIUS, normalizeAngle, requireFinite } from './units.mjs';

function validateCartesian(point, label) {
    if (!point) throw new TypeError(`${label}: point is missing.`);
    for (const axis of ['e', 'n', 'z']) requireFinite(point[axis], `${label}, ${axis.toUpperCase()}`);
}
function validateHeight(height, label) {
    requireFinite(height, label);
    if (height < 0) throw new RangeError(`${label}: height must not be negative.`);
}
/** Azimuth clockwise from North. No DOM access; arguments are never changed. */
export function calculateAzimuth(from, to) {
    validateCartesian(from, 'Station');
    validateCartesian(to, 'Direction point');
    const east = to.e - from.e;
    const north = to.n - from.n;
    if (!Number.isFinite(east) || !Number.isFinite(north)) throw new RangeError('Coordinate difference is out of range.');
    if (Math.hypot(east, north) <= 1e-9) {
        throw new RangeError('Station and direction point coincide in plan: azimuth is undefined.');
    }
    return normalizeAngle(Math.atan2(east, north));
}
/** Returns a separate horizontal distance reduction; it does not alter point coordinates. */
export function reduceToSeaLevel(distance, meanHeight, earthRadius = DEFAULT_EARTH_RADIUS) {
    requireFinite(distance, 'Horizontal distance');
    requireFinite(meanHeight, 'Mean elevation');
    requireFinite(earthRadius, 'Earth radius');
    if (distance < 0 || earthRadius <= 0 || earthRadius + meanHeight <= 0 || !Number.isFinite(earthRadius + meanHeight)) {
        throw new RangeError('Invalid sea-level reduction parameters.');
    }
    return requireFinite(distance * (earthRadius / (earthRadius + meanHeight)), 'Reduced distance');
}
/**
 * Cartesian ground coordinates -> computed stakeout angles and distances.
 * Heights belong to the setup and the target observation, not to the ground point.
 * All angles in the returned object are radians, all distances are metres.
 */
export function calculatePolar({ station, orientation, target, instrumentHeight, targetHeight, earthRadius = DEFAULT_EARTH_RADIUS }) {
    validateCartesian(station, 'Station');
    validateCartesian(orientation, 'Orientation');
    validateCartesian(target, 'Target');
    validateHeight(instrumentHeight, 'Instrument height');
    validateHeight(targetHeight, 'Target height');
    const orientationAzimuth = calculateAzimuth(station, orientation);
    const targetAzimuth = calculateAzimuth(station, target);
    const relativeAzimuth = normalizeAngle(targetAzimuth - orientationAzimuth);
    const eastDifference = target.e - station.e;
    const northDifference = target.n - station.n;
    const verticalDifference = (target.z + targetHeight) - (station.z + instrumentHeight);
    const horizontalDistance = Math.hypot(eastDifference, northDifference);
    const slopeDistance = Math.hypot(horizontalDistance, verticalDifference);
    const zenithAngle = Math.PI / 2 - Math.atan2(verticalDifference, horizontalDistance);
    // Preserve the existing mean-ground-height convention for the displayed reduction.
    const meanGroundHeight = (station.z + target.z) / 2;
    const seaLevelHorizontalDistance = reduceToSeaLevel(horizontalDistance, meanGroundHeight, earthRadius);
    const seaLevelScaleFactor = seaLevelHorizontalDistance / horizontalDistance;
    const result = { orientationAzimuth, targetAzimuth, relativeAzimuth, zenithAngle,
        eastDifference, northDifference, verticalDifference, horizontalDistance, slopeDistance,
        meanGroundHeight, seaLevelHorizontalDistance, seaLevelScaleFactor,
        stationGroundElevation: station.z, targetGroundElevation: target.z,
        instrumentHeight, targetHeight, earthRadius };
    for (const [key, value] of Object.entries(result)) requireFinite(value, `Result ${key}`);
    return result;
}
