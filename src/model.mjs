import { calculatePolar } from './core/polar.mjs';
import { DEFAULT_EARTH_RADIUS, requireFinite } from './core/units.mjs';
import { parsePointsCsv } from './io/csv.mjs';
import { parseLandXML11 } from './io/landxml11.mjs';
import { reduceSurvey } from './core/survey-reduction.mjs';

export function createProject(name = 'New stakeout') {
    return { schemaVersion: 1, id: globalThis.crypto?.randomUUID?.() ?? `project-${Date.now()}-${Math.random().toString(36).slice(2)}`, name, revision: 0,
        units: { linear: 'metre', angular: 'radian' },
        frame: { type: 'local-cartesian', axisOrder: 'ENZ', verticalDatum: 'unspecified' },
        sourceFiles: [], sourcePoints: [], pointDefaults: {}, setups: [], observations: [],
        equipment: [], sourcePointReferences: [], importSummary: null,
        calculatedPoints: [], surveyReduction: null, controls: [], georeference: null, georeferencedPoints: [],
        mapLayers: [], mapView: { type: 'local' }, fieldbook: [], diagnostics: [] };
}
/** Returns a replacement project only after every CSV row has been validated. */
export function importCsvProject(project, text, fileName = 'Manual points.csv') {
    const parsed = parsePointsCsv(text);
    return { ...project, revision: project.revision + 1,
        sourceFiles: [{ ...parsed.source, name: fileName }], sourcePoints: parsed.points,
        pointDefaults: parsed.pointDefaults, setups: [], observations: [], calculatedPoints: [], surveyReduction: null,
        controls: [], georeference: null, georeferencedPoints: [], diagnostics: [],
        equipment: [], sourcePointReferences: [], importSummary: null,
        // Historical fieldbook entries retain their immutable input snapshots and revision.
        fieldbook: [...project.fieldbook] };
}
/** Preserve exported points while deriving a separate result from each raw observation. */
export function importLandXMLProject(project, text, fileName = 'Survey.land.xml', options = {}) {
    const parsed = parseLandXML11(text, options);
    const imported = { ...project, revision: project.revision + 1,
        sourceFiles: [{ ...parsed.source, name: fileName }], sourcePoints: parsed.points,
        pointDefaults: parsed.pointDefaults, setups: parsed.setups, observations: parsed.observations,
        equipment: parsed.equipment, sourcePointReferences: parsed.pointReferences, importSummary: parsed.summary,
        diagnostics: parsed.diagnostics, calculatedPoints: [], controls: [], georeference: null,
        surveyReduction: null, georeferencedPoints: [], fieldbook: [...project.fieldbook] };
    return reduceSurveyProject(imported, options);
}
export function reduceSurveyProject(project, options = {}) {
    const surveyReduction = reduceSurvey(project, options);
    return { ...project, calculatedPoints: surveyReduction.calculatedPoints, surveyReduction };
}
export function importSurveyProject(project, text, fileName = 'Manual points', options = {}) {
    const xmlCandidate = typeof text === 'string'
        && text.replace(/^(?:[\s\u0000-\u0020\uFEFF]|Ôªø|ï»¿|\.[ \t]*(?:\r?\n|$))+/, '').startsWith('<');
    if (xmlCandidate || /\.(?:xml|landxml)$/i.test(fileName)) {
        return importLandXMLProject(project, text, fileName, options);
    }
    return importCsvProject(project, text, fileName);
}
export function pointById(project, id) {
    const point = project.sourcePoints.find(point => point.id === id);
    if (!point) throw new RangeError('Selected point was not found in the project.');
    return point;
}
export function defaultPointHeight(project, id, role) {
    const key = role === 'instrument' ? 'instrumentHeight' : 'targetHeight';
    if (project.pointDefaults[id]?.[key + 'Ambiguous']) throw new RangeError(`Multiple ${role} heights for this point: choose an unambiguous point configuration before stakeout.`);
    return project.pointDefaults[id]?.[key] ?? 0;
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
    const prefix = `setup-${project.revision}-`;
    const setupNumber = project.setups.reduce((highest, setup) => setup.id.startsWith(prefix) ? Math.max(highest, Number(setup.id.slice(prefix.length))) : highest, 0) + 1;
    const setup = { id: `${prefix}${setupNumber}`,
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
    return { ...project, fieldbook, setups: project.setups.filter(setup => setup.kind === 'survey' || referenced.has(setup.id)) };
}
export function validateConfigurationNumber(raw, label, { positive = false } = {}) {
    if (typeof raw !== 'string' || raw.trim() === '') throw new TypeError(`${label}: this field is required.`);
    const value = Number(raw);
    requireFinite(value, label);
    if (positive ? value <= 0 : value < 0) throw new RangeError(`${label}: ${positive ? 'must be greater than zero' : 'must not be negative'}.`);
    return value;
}
