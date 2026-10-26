import { calculatePolar } from './core/polar.mjs';
import { DEFAULT_EARTH_RADIUS, requireFinite } from './core/units.mjs';
import { parsePointsCsv } from './io/csv.mjs';

export function createProject(name = 'Nuovo tracciamento') {
    return { schemaVersion: 1, id: globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(36).slice(2)}`, name, revision: 0,
        units: { linear: 'metre', angular: 'radian' },
        frame: { type: 'local-cartesian', axisOrder: 'ENZ', verticalDatum: 'unspecified' },
        sourceFiles: [], sourcePoints: [], pointDefaults: {}, setups: [], observations: [],
        calculatedPoints: [], controls: [], georeference: null, georeferencedPoints: [],
        mapLayers: [], mapView: { type: 'local' }, fieldbook: [], diagnostics: [] };
}
/** Returns a replacement project only after every CSV row has been validated. */
export function importCsvProject(project, text, fileName = 'Punti manuali.csv') {
    const parsed = parsePointsCsv(text);
    return { ...project, revision: project.revision + 1,
        sourceFiles: [{ ...parsed.source, name: fileName }], sourcePoints: parsed.points,
        pointDefaults: parsed.pointDefaults, setups: [], observations: [], calculatedPoints: [],
        controls: [], georeference: null, georeferencedPoints: [], diagnostics: [],
        // Historical fieldbook entries retain their immutable input snapshots and revision.
        fieldbook: [...project.fieldbook] };
}
export function pointById(project, id) {
    const point = project.sourcePoints.find(point => point.id === id);
    if (!point) throw new RangeError('Punto selezionato non presente nel progetto.');
    return point;
}
export function defaultPointHeight(project, id, role) {
    return project.pointDefaults[id]?.[role === 'instrument' ? 'instrumentHeight' : 'targetHeight'] ?? 0;
}
export function prepareStakeout(project, selection) {
    const station = pointById(project, selection.stationId);
    const orientation = pointById(project, selection.orientationId);
    const target = pointById(project, selection.targetId);
    const result = calculatePolar({ station, orientation, target,
        instrumentHeight: selection.instrumentHeight, targetHeight: selection.targetHeight,
        earthRadius: selection.earthRadius ?? DEFAULT_EARTH_RADIUS });
    return { station: { ...station }, orientation: { ...orientation }, target: { ...target }, result };
}
/** A computed stakeout is not a raw measured observation. */
export function appendStakeout(project, selection) {
    const calculation = prepareStakeout(project, selection);
    const setup = { id: `setup-${project.revision}-${project.setups.length + 1}`,
        kind: 'stakeout', pointId: calculation.station.id, orientationPointId: calculation.orientation.id,
        instrumentHeight: calculation.result.instrumentHeight, sourceRevision: project.revision };
    const entry = { id: `entry-${project.fieldbook.reduce((max, row) => Math.max(max, Number(row.id.slice(6))), 0) + 1}`,
        kind: 'computed-stakeout', setupId: setup.id, sourceRevision: project.revision,
        ...calculation };
    return { project: { ...project, setups: [...project.setups, setup], fieldbook: [...project.fieldbook, entry] }, entry };
}
export function removeFieldbookEntry(project, id) {
    const fieldbook = project.fieldbook.filter(entry => entry.id !== id);
    const referenced = new Set(fieldbook.filter(entry => entry.sourceRevision === project.revision).map(entry => entry.setupId));
    return { ...project, fieldbook, setups: project.setups.filter(setup => referenced.has(setup.id)) };
}
export function validateConfigurationNumber(raw, label, { positive = false } = {}) {
    if (typeof raw !== 'string' || raw.trim() === '') throw new TypeError(`${label}: campo obbligatorio.`);
    const value = Number(raw);
    requireFinite(value, label);
    if (positive ? value <= 0 : value < 0) throw new RangeError(`${label}: ${positive ? 'deve essere maggiore di zero' : 'non può essere negativa'}.`);
    return value;
}
