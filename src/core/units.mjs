/** Internal angles are radians, clockwise from North. Coordinates use E/N/Z metres. */
export const FULL_CIRCLE = 2 * Math.PI;
export const DEFAULT_EARTH_RADIUS = 6371000;
export function requireFinite(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${label}: enter a finite number.`);
    }
    return value;
}
export function normalizeAngle(angle) {
    requireFinite(angle, 'Angle');
    const normalized = ((angle % FULL_CIRCLE) + FULL_CIRCLE) % FULL_CIRCLE;
    return normalized === 0 ? 0 : normalized;
}
export function radiansToGon(radians) {
    return requireFinite(radians, 'Angle') * 200 / Math.PI;
}
export function gonToRadians(gon) {
    return requireFinite(gon, 'Angle') * Math.PI / 200;
}
export function kilometresToMetres(kilometres) {
    const metres = requireFinite(kilometres, 'Earth radius') * 1000;
    return requireFinite(metres, 'Earth radius');
}
