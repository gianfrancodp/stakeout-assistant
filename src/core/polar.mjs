import { DEFAULT_EARTH_RADIUS, normalizeAngle, requireFinite } from './units.mjs';

function validateCartesian(point, label) {
    if (!point) throw new TypeError(`${label}: punto assente.`);
    for (const axis of ['e', 'n', 'z']) requireFinite(point[axis], `${label}, ${axis.toUpperCase()}`);
}
function validateHeight(height, label) {
    requireFinite(height, label);
    if (height < 0) throw new RangeError(`${label}: l’altezza non può essere negativa.`);
}
/** Azimuth clockwise from North. No DOM access; arguments are never changed. */
export function calculateAzimuth(from, to) {
    validateCartesian(from, 'Stazione');
    validateCartesian(to, 'Punto di direzione');
    const east = to.e - from.e;
    const north = to.n - from.n;
    if (!Number.isFinite(east) || !Number.isFinite(north)) throw new RangeError('Differenza di coordinate fuori intervallo.');
    if (Math.hypot(east, north) <= 1e-9) {
        throw new RangeError('Stazione e punto di direzione coincidono in planimetria: azimut indeterminato.');
    }
    return normalizeAngle(Math.atan2(east, north));
}
/** Returns a separate horizontal distance reduction; it does not alter point coordinates. */
export function reduceToSeaLevel(distance, meanHeight, earthRadius = DEFAULT_EARTH_RADIUS) {
    requireFinite(distance, 'Distanza orizzontale');
    requireFinite(meanHeight, 'Quota media');
    requireFinite(earthRadius, 'Raggio terrestre');
    if (distance < 0 || earthRadius <= 0 || earthRadius + meanHeight <= 0 || !Number.isFinite(earthRadius + meanHeight)) {
        throw new RangeError('Parametri di riduzione al mare non validi.');
    }
    return requireFinite(distance * (earthRadius / (earthRadius + meanHeight)), 'Distanza ridotta');
}
/**
 * Cartesian ground coordinates -> computed stakeout angles and distances.
 * Heights belong to the setup and the target observation, not to the ground point.
 * All angles in the returned object are radians, all distances are metres.
 */
export function calculatePolar({ station, orientation, target, instrumentHeight, targetHeight, earthRadius = DEFAULT_EARTH_RADIUS }) {
    validateCartesian(station, 'Stazione');
    validateCartesian(orientation, 'Orientamento');
    validateCartesian(target, 'Bersaglio');
    validateHeight(instrumentHeight, 'Altezza strumento');
    validateHeight(targetHeight, 'Altezza bersaglio');
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
    for (const [key, value] of Object.entries(result)) requireFinite(value, `Risultato ${key}`);
    return result;
}
