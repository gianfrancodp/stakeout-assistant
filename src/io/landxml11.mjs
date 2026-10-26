/** LandXML 1.1 / Leica import. No coordinate reduction or network adjustment is performed. */
export class LandXMLValidationError extends Error {
    constructor(message, document = null) {
        super(document ? `LandXML document ${document}: ${message}` : `LandXML: ${message}`);
        this.name = 'LandXMLValidationError';
        this.issues = [{ document, message }];
    }
}
export const LANDXML_NAMESPACE = 'http://www.landxml.org/schema/LandXML-1.1';
const LENGTH_UNITS = { meter: 1, millimeter: 0.001, centimeter: 0.01, kilometer: 1000, foot: 0.3048, USSurveyFoot: 1200 / 3937 };
const children = node => Array.from(node.childNodes || []).filter(child => child.nodeType === 1);
const firstChild = (node, name) => children(node).find(child => child.localName === name && child.namespaceURI === LANDXML_NAMESPACE);
const descendants = (node, name) => Array.from(node.getElementsByTagNameNS(LANDXML_NAMESPACE, name));
const attributes = node => node ? Object.fromEntries(Array.from(node.attributes).map(attr => [attr.name, attr.value])) : {};
const directText = node => Array.from(node?.childNodes || []).filter(child => child.nodeType === 3 || child.nodeType === 4).map(child => child.nodeValue).join(' ').trim();
function xmlNumber(value, label, document) {
    if (value === null || value === undefined || value.trim() === '' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) || !Number.isFinite(Number(value))) {
        throw new LandXMLValidationError(`${label} must be a finite number.`, document);
    }
    return Number(value);
}
export function landxmlAngleToRadians(value, unit) {
    const number = xmlNumber(String(value), 'Angle');
    if (['grads', 'gon', 'gons'].includes(unit)) return number * (Math.PI / 200);
    if (['decimal degrees', 'degrees'].includes(unit)) return number * (Math.PI / 180);
    if (unit === 'radians') return number;
    if (['dd.mm.ss', 'dd.mmss'].includes(unit)) {
        const absolute = Math.abs(number), degree = Math.floor(absolute);
        const minute = Math.floor((absolute - degree) * 100 + 1e-9);
        const second = ((absolute - degree) * 100 - minute) * 100;
        if (minute >= 60 || second >= 60.000001) throw new LandXMLValidationError('Invalid dd.mm.ss angle.');
        return Math.sign(number) * (degree + minute / 60 + second / 3600) * Math.PI / 180;
    }
    throw new LandXMLValidationError(`Unsupported angle unit: ${unit}.`);
}
/** DOMParser is native in the browser; tests can inject an equivalent constructor. */
export function parseLandXML11(text, { DOMParser: Parser = globalThis.DOMParser } = {}) {
    if (typeof text !== 'string' || !text.trim()) throw new LandXMLValidationError('Empty XML input.');
    if (text.length > 10 * 1024 * 1024) throw new LandXMLValidationError('Maximum input size: 10 MB.');
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new LandXMLValidationError('DTD and external entities are not supported.');
    if (typeof Parser !== 'function') throw new LandXMLValidationError('DOMParser is unavailable in this environment.');
    // Leica appends independent XML documents using the DOS end-of-file character.
    const chunks = text.split('\x1a').map(chunk => chunk.replace(/^\s*\uFEFF/, '').trim()).filter(Boolean);
    const diagnostics = [], documents = [], setups = [], observations = [], equipment = [];
    const catalog = new Map(), heightCandidates = new Map();
    function diagnostic(code, message, document) { diagnostics.push({ severity: 'warning', code, message, document }); }
    function reference(name, document) {
        if (!name?.trim()) throw new LandXMLValidationError('Point name/reference is missing.', document);
        name = name.trim();
        if (!catalog.has(name)) catalog.set(name, { id: `point-${catalog.size + 1}`, name, position: null, role: '', origin: null });
        return catalog.get(name);
    }
    function position(node, factor, document) {
        const content = directText(node);
        if (!content) return null;
        const parts = content.split(/\s+/);
        if (parts.length !== 3) throw new LandXMLValidationError(`${node.localName} requires North East Elevation coordinates.`, document);
        const values = parts.map(value => xmlNumber(value, node.localName, document) * factor);
        if (!values.every(Number.isFinite)) throw new LandXMLValidationError('Coordinate conversion overflow.', document);
        return { n: values[0], e: values[1], z: values[2] };
    }
    function setPosition(point, value, origin, document) {
        if (!value) return;
        if (point.position) {
            const delta = Math.hypot(point.position.e - value.e, point.position.n - value.n, point.position.z - value.z);
            if (delta > 0.000001) {
                if (origin === 'CgPoint') throw new LandXMLValidationError(`Conflicting coordinates for point ${point.name}.`, document);
                diagnostic('coordinate-disagreement', `${point.name}: exported ${origin} differs from the point catalog; both source records are preserved.`, document);
            }
        } else { point.position = value; point.origin = origin; }
    }
    function recordHeight(id, role, value) {
        if (!heightCandidates.has(id)) heightCandidates.set(id, { instrument: new Set(), target: new Set() });
        heightCandidates.get(id)[role].add(value);
    }
    for (const [index, chunk] of chunks.entries()) {
        const documentIndex = index + 1;
        let doc;
        try {
            doc = new Parser({ onError: (level, message) => { throw new Error(`${level}: ${message}`); } }).parseFromString(chunk, 'application/xml');
        } catch (error) { throw new LandXMLValidationError(`Malformed XML: ${error.message}`, documentIndex); }
        const root = doc.documentElement;
        if (!root || root.localName === 'parsererror' || doc.getElementsByTagNameNS('*', 'parsererror').length) throw new LandXMLValidationError('Malformed XML.', documentIndex);
        if (root.localName !== 'LandXML' || root.namespaceURI !== LANDXML_NAMESPACE || root.getAttribute('version') !== '1.1') {
            throw new LandXMLValidationError('Expected LandXML 1.1 with the LandXML-1.1 namespace.', documentIndex);
        }
        const unitsNode = firstChild(root, 'Units');
        const unit = unitsNode && (firstChild(unitsNode, 'Metric') || firstChild(unitsNode, 'Imperial'));
        if (!unit) throw new LandXMLValidationError('Units/Metric or Units/Imperial is required.', documentIndex);
        const linearUnit = unit.getAttribute('linearUnit');
        const factor = Object.hasOwn(LENGTH_UNITS, linearUnit) ? LENGTH_UNITS[linearUnit] : null;
        if (!factor) throw new LandXMLValidationError(`Unsupported linear unit: ${linearUnit}.`, documentIndex);
        const angularUnit = unit.getAttribute('angularUnit') || 'radians';
        const leica = descendants(root, 'Application').some(node => /leica/i.test(node.getAttribute('manufacturer') || ''));
        const directionUnit = unit.getAttribute('directionUnit') || (leica ? angularUnit : 'radians');
        landxmlAngleToRadians(0, angularUnit); landxmlAngleToRadians(0, directionUnit);
        if (leica && !unit.hasAttribute('directionUnit')) diagnostic('leica-direction-unit', `Leica profile: missing directionUnit interpreted as ${angularUnit}.`, documentIndex);
        const numeric = (node, key, fallback = null) => node.hasAttribute(key) ? xmlNumber(node.getAttribute(key), `${node.localName}.${key}`, documentIndex) : fallback;
        const length = (node, key, fallback = null) => {
            const value = numeric(node, key, fallback);
            if (value === null) return null;
            const converted = value * factor;
            if (!Number.isFinite(converted)) throw new LandXMLValidationError(`${key} conversion overflow.`, documentIndex);
            return converted;
        };
        const angle = (node, key, unitName = angularUnit) => {
            const value = numeric(node, key);
            return value === null ? null : landxmlAngleToRadians(value, unitName);
        };
        documents.push({ index: documentIndex, version: '1.1', namespace: root.namespaceURI, linearUnit, angularUnit, directionUnit, rootAttributes: attributes(root) });
        for (const node of descendants(root, 'CgPoint')) {
            const point = reference(node.getAttribute('name'), documentIndex), value = position(node, factor, documentIndex);
            if (!value) throw new LandXMLValidationError(`CgPoint ${point.name} has no 3D coordinates.`, documentIndex);
            setPosition(point, value, 'CgPoint', documentIndex);
            const role = node.getAttribute('role') || '';
            if (!point.role || /control|fixed|reference/i.test(role)) point.role = role;
        }
        const localEquipment = new Map();
        for (const node of descendants(root, 'InstrumentDetails')) {
            const sourceId = node.getAttribute('id');
            if (!sourceId || localEquipment.has(sourceId)) throw new LandXMLValidationError('Missing or duplicated InstrumentDetails id.', documentIndex);
            const entry = { id: `document-${documentIndex}:${sourceId}`, sourceId, document: documentIndex, attributes: attributes(node),
                properties: descendants(node, 'Property').map(property => attributes(property)) };
            localEquipment.set(sourceId, entry); equipment.push(entry);
        }
        const localSetups = new Map();
        for (const node of descendants(root, 'InstrumentSetup')) {
            const sourceId = node.getAttribute('id'), instrument = firstChild(node, 'InstrumentPoint');
            if (!sourceId || localSetups.has(sourceId)) throw new LandXMLValidationError('Missing or duplicated InstrumentSetup id.', documentIndex);
            const point = reference(instrument?.getAttribute('pntRef') || instrument?.getAttribute('name') || node.getAttribute('stationName'), documentIndex);
            const exportedPosition = position(instrument, factor, documentIndex);
            setPosition(point, exportedPosition, 'InstrumentPoint', documentIndex);
            const instrumentHeight = length(node, 'instrumentHeight');
            if (instrumentHeight === null || instrumentHeight < 0) throw new LandXMLValidationError('Nonnegative instrumentHeight is required.', documentIndex);
            const equipmentRef = node.getAttribute('instrumentDetailsID');
            if (equipmentRef && !localEquipment.has(equipmentRef)) throw new LandXMLValidationError(`Unknown instrumentDetailsID ${equipmentRef}.`, documentIndex);
            const setup = { id: `document-${documentIndex}:${sourceId}`, sourceId, document: documentIndex, kind: 'survey',
                pointId: point.id, stationName: node.getAttribute('stationName') || point.name, instrumentHeight,
                orientationAzimuth: angle(node, 'orientationAzimuth', directionUnit), circleAzimuth: angle(node, 'circleAzimuth', directionUnit),
                equipmentId: equipmentRef ? localEquipment.get(equipmentRef).id : null,
                exportedPosition, attributes: attributes(node),
                properties: children(node).filter(child => child.localName === 'Feature' && child.namespaceURI === LANDXML_NAMESPACE).flatMap(feature => descendants(feature, 'Property').map(property => attributes(property))), backsights: [] };
            localSetups.set(sourceId, setup); setups.push(setup); recordHeight(point.id, 'instrument', instrumentHeight);
        }
        function owner(node) {
            for (let current = node; current?.nodeType === 1; current = current.parentNode) {
                if (current.hasAttribute('setupID')) return current.getAttribute('setupID');
                if (current.localName === 'InstrumentSetup') return current.getAttribute('id');
            }
            return null;
        }
        for (const node of descendants(root, 'Backsight')) {
            const setup = localSetups.get(owner(node)), targetNode = firstChild(node, 'BacksightPoint');
            if (!setup) throw new LandXMLValidationError('Backsight references an unknown setupID.', documentIndex);
            const point = reference(targetNode?.getAttribute('pntRef') || targetNode?.getAttribute('name'), documentIndex);
            setPosition(point, position(targetNode, factor, documentIndex), 'BacksightPoint', documentIndex);
            setup.backsights.push({ pointId: point.id, circle: angle(node, 'circle'), azimuth: angle(node, 'azimuth', directionUnit), attributes: attributes(node) });
        }
        const targetSetups = new Map();
        for (const node of descendants(root, 'TargetSetup')) {
            const id = node.getAttribute('id');
            if (!id || targetSetups.has(id)) throw new LandXMLValidationError('Missing or duplicated TargetSetup id.', documentIndex);
            targetSetups.set(id, node);
        }
        for (const node of descendants(root, 'RawObservation')) {
            const setup = localSetups.get(owner(node));
            if (!setup) throw new LandXMLValidationError('RawObservation references an unknown setupID.', documentIndex);
            if (descendants(node, 'OffsetVals').length) throw new LandXMLValidationError('OffsetVals observations are not supported in this importer.', documentIndex);
            const target = firstChild(node, 'TargetPoint'), targetSetupId = node.getAttribute('targetSetupID');
            const targetSetup = targetSetupId ? targetSetups.get(targetSetupId) : null;
            if (targetSetupId && !targetSetup) throw new LandXMLValidationError(`Unknown targetSetupID ${targetSetupId}.`, documentIndex);
            const targetSetupPoint = targetSetup && firstChild(targetSetup, 'TargetPoint');
            const point = reference(target?.getAttribute('pntRef') || target?.getAttribute('name') || targetSetupPoint?.getAttribute('pntRef') || targetSetupPoint?.getAttribute('name'), documentIndex);
            const exportedPosition = position(target, factor, documentIndex) || position(targetSetupPoint, factor, documentIndex);
            setPosition(point, exportedPosition, 'TargetPoint', documentIndex);
            const targetHeight = node.hasAttribute('targetHeight') ? length(node, 'targetHeight') : targetSetup ? length(targetSetup, 'targetHeight', 0) : 0;
            const raw = { id: `observation-${observations.length + 1}`, kind: 'raw-survey', document: documentIndex,
                setupId: setup.id, targetPointId: point.id, targetName: point.name,
                purpose: node.getAttribute('purpose') || 'normal', targetHeight,
                horizontalAngle: angle(node, 'horizAngle'), zenithAngle: angle(node, 'zenithAngle'), azimuth: angle(node, 'azimuth', directionUnit),
                slopeDistance: length(node, 'slopeDistance'), horizontalDistance: length(node, 'horizDistance'), verticalDistance: length(node, 'vertDistance'),
                directFace: node.hasAttribute('directFace') ? node.getAttribute('directFace') : null,
                exportedPosition, attributes: attributes(node), properties: descendants(node, 'Property').map(property => attributes(property)) };
            for (const key of ['horizontalAngle', 'zenithAngle', 'azimuth']) {
                if (raw[key] !== null && (!Number.isFinite(raw[key]) || raw[key] < 0 || raw[key] > 2 * Math.PI + 1e-10)) {
                    throw new LandXMLValidationError(`${key} is outside one complete circle.`, documentIndex);
                }
            }
            if (raw.horizontalAngle === null && raw.azimuth === null) throw new LandXMLValidationError(`Missing direction for target ${point.name}.`, documentIndex);
            if (targetHeight < 0 || raw.slopeDistance < 0 || raw.horizontalDistance < 0) throw new LandXMLValidationError(`Negative distance or target height at ${point.name}.`, documentIndex);
            if (raw.directFace !== null && !['true', 'false', '1', '0'].includes(raw.directFace)) throw new LandXMLValidationError('Invalid directFace boolean.', documentIndex);
            raw.directFace = raw.directFace === null ? null : ['true', '1'].includes(raw.directFace);
            raw.directionOnly = raw.slopeDistance === null && raw.horizontalDistance === null;
            observations.push(raw); recordHeight(point.id, 'target', targetHeight);
            if (raw.purpose === 'backsight') setup.backsights.push({ observationId: raw.id, pointId: point.id, circle: raw.horizontalAngle, azimuth: raw.azimuth });
        }
        for (const tag of ['ReducedObservation', 'RedHorizontalPosition', 'RedVerticalPosition', 'Surface', 'Parcel', 'Alignment']) {
            if (descendants(root, tag).length) diagnostic('unsupported-element', `${tag} is retained in the source XML but not interpreted by this importer.`, documentIndex);
        }
    }
    const points = [...catalog.values()].filter(point => point.position).map(point => ({ id: point.id, name: point.name, ...point.position, role: point.role, coordinateSource: point.origin }));
    if (!points.length && !observations.length) throw new LandXMLValidationError('No usable 3D points or raw observations found.');
    const pointDefaults = {};
    for (const point of catalog.values()) {
        const values = heightCandidates.get(point.id);
        const defaults = {};
        for (const role of ['instrument', 'target']) {
            const candidates = [...(values?.[role] || [])];
            defaults[`${role}Height`] = candidates.length === 1 ? candidates[0] : 0;
            if (candidates.length > 1) {
                defaults[`${role}HeightAmbiguous`] = true;
                diagnostic('ambiguous-height', `${point.name}: multiple ${role} heights; a single stakeout default cannot be inferred.`, null);
            }
        }
        pointDefaults[point.id] = defaults;
    }
    if (documents.length > 1) diagnostic('concatenated-documents', `${documents.length} DOS EOF-separated LandXML documents were combined; duplicate catalog coordinates checked.`, null);
    if (observations.length) diagnostic('exported-coordinates', 'Point coordinates are imported from the Leica export. Raw polar observations are preserved; coordinate reduction is planned for phase 3.', null);
    return { points, pointDefaults, setups, observations, equipment, diagnostics,
        pointReferences: [...catalog.values()].map(point => ({ id: point.id, name: point.name, hasCoordinates: !!point.position })),
        source: { format: 'landxml', version: '1.1', axisOrder: 'NEZ->ENZ', text, documents },
        summary: { documents: documents.length, points: points.length, setups: setups.length, observations: observations.length,
            directionOnly: observations.filter(raw => raw.directionOnly).length } };
}
