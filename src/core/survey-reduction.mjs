import { normalizeAngle, requireFinite } from './units.mjs';

const TWO_PI = 2 * Math.PI;
const POINT_TOLERANCE = 0.01;
const ANGLE_TOLERANCE = Math.PI / 180;
const angleDifference = (a, b) => normalizeAngle(a - b + Math.PI) - Math.PI;
const asPoint = point => point && [point.e, point.n, point.z].every(Number.isFinite) ? { e: point.e, n: point.n, z: point.z } : null;
const positionKey = id => String(id);

function circularMean(angles) {
    const x = angles.reduce((sum, angle) => sum + Math.cos(angle), 0);
    const y = angles.reduce((sum, angle) => sum + Math.sin(angle), 0);
    if (Math.hypot(x, y) <= 1e-12) return null;
    return normalizeAngle(Math.atan2(y, x));
}

function pointAzimuth(from, to) {
    if (Math.hypot(to.e - from.e, to.n - from.n) <= 1e-9) return null;
    return normalizeAngle(Math.atan2(to.e - from.e, to.n - from.n));
}

function observationReading(observation) {
    if (observation.horizontalAngle == null) return null;
    let reading = observation.horizontalAngleConvention === 'clockwise-from-north'
        ? observation.horizontalAngle
        : Math.PI / 2 - observation.horizontalAngle;
    if (observation.directFace === false) reading += Math.PI;
    return normalizeAngle(reading);
}

function correctedZenith(observation) {
    if (observation.zenithAngle == null) return null;
    const zenith = observation.directFace === false ? TWO_PI - observation.zenithAngle : observation.zenithAngle;
    if (!Number.isFinite(zenith) || zenith < 0 || zenith > Math.PI) return null;
    return zenith;
}

function propertyValue(records, names) {
    for (const record of records) for (const property of record?.properties || []) {
        const label = String(property.label || property.name || '').toLowerCase();
        if (names.includes(label)) {
            const value = Number(property.value);
            if (Number.isFinite(value)) return value;
        }
    }
    return null;
}

function observationFrame(project, setup, obs, stationPosition, knownPositions, sourceById) {
    const candidates = [];
    const sourceTargets = [];
    for (const backsight of setup.backsights || []) {
        const target = knownPositions.get(positionKey(backsight.pointId));
        const circle = backsight.circle == null ? null : observationReading({ horizontalAngle: backsight.circle,
            horizontalAngleConvention: setup.horizontalAngleConvention });
        const azimuth = target ? pointAzimuth(stationPosition, target) : null;
        if (azimuth != null && circle != null) candidates.push({ angle: azimuth - circle,
            source: sourceById.has(positionKey(backsight.pointId)) ? 'backsight' : 'derived-backsight' });
        else if (backsight.azimuth != null && circle != null) candidates.push({ angle: -backsight.azimuth - circle, source: 'backsight-azimuth' });
    }
    for (const obs of project.observations.filter(item => item.setupId === setup.id && item.purpose !== 'check')) {
        const target = knownPositions.get(positionKey(obs.targetPointId));
        const reading = observationReading(obs);
        const azimuth = target ? pointAzimuth(stationPosition, target) : null;
        if (!target || azimuth == null || reading == null || obs.azimuth != null) continue;
        if (sourceById.has(positionKey(obs.targetPointId))) sourceTargets.push(obs);
        candidates.push({ angle: azimuth - reading,
            source: sourceById.has(positionKey(obs.targetPointId)) ? 'exported-coordinates' : 'derived-coordinate-target' });
    }
    if (candidates.length) {
        const offset = circularMean(candidates.map(candidate => candidate.angle));
        return { offset, source: sourceTargets.length ? 'exported-coordinate-checks' : candidates[0].source,
            candidates, sourceTargets };
    }
    if (setup.orientationAzimuth != null) {
        const orientation = normalizeAngle(-setup.orientationAzimuth);
        const circle = setup.circleAzimuth == null ? 0 : normalizeAngle(-setup.circleAzimuth);
        return { offset: normalizeAngle(orientation - circle), source: 'setup-orientation-metadata', candidates: [], sourceTargets: [] };
    }
    return { offset: null, source: null, candidates: [], sourceTargets: [] };
}

function reduceObservation(project, setup, observation, stationPosition, frame, config, pointById) {
    const warnings = [];
    const horizontal = observation.horizontalDistance;
    const zenith = correctedZenith(observation);
    let horizontalDistance, verticalDifference;
    if (observation.slopeDistance != null && zenith != null) {
        horizontalDistance = observation.slopeDistance * Math.sin(zenith);
        verticalDifference = observation.slopeDistance * Math.cos(zenith);
    } else if (horizontal != null && observation.verticalDistance != null) {
        horizontalDistance = horizontal;
        verticalDifference = observation.verticalDistance;
    } else {
        return { observationId: observation.id, pointId: observation.targetPointId, name: observation.targetName,
            setupId: setup.id, status: observation.directionOnly ? 'direction-only' : 'insufficient-distance-data', warnings };
    }
    if (!Number.isFinite(horizontalDistance) || !Number.isFinite(verticalDifference) || horizontalDistance < 0) {
        return { observationId: observation.id, pointId: observation.targetPointId, name: observation.targetName,
            setupId: setup.id, status: 'invalid-measurement', warnings: ['Distance components are invalid.'] };
    }
    if (horizontal != null && observation.slopeDistance != null && Math.abs(horizontalDistance - horizontal) > config.distanceTolerance) {
        warnings.push(`Slope and horizontal distances differ by ${horizontalDistance - horizontal} m.`);
    }
    let azimuth = observation.azimuth == null ? null : normalizeAngle(-observation.azimuth);
    if (azimuth == null) {
        const reading = observationReading(observation);
        if (reading == null || frame.offset == null) {
            return { observationId: observation.id, pointId: observation.targetPointId, name: observation.targetName,
                setupId: setup.id, status: 'unresolved-orientation', warnings };
        }
        azimuth = normalizeAngle(reading + frame.offset);
    }
    const sourceTarget = pointById.get(positionKey(observation.targetPointId));
    const correctionReference = (observation.properties || []).some(property => /correctionref/i.test(`${property.label || ''} ${property.name || ''}`));
    const equipment = project.equipment.find(item => item.id === setup.equipmentId);
    const correctionRecords = [setup, equipment, observation];
    const sourceRadius = propertyValue(correctionRecords, ['referenceradius', 'earthradius', 'radius']);
    const sourceRefraction = propertyValue(correctionRecords, ['refractioncoefficient', 'refractionfactor']);
    const referenceRadius = sourceRadius ?? config.referenceRadius;
    const refractionCoefficient = sourceRefraction ?? config.refractionCoefficient;
    if (referenceRadius <= 0 || refractionCoefficient < 0 || refractionCoefficient >= 1) {
        return { observationId: observation.id, pointId: observation.targetPointId, name: observation.targetName,
            setupId: setup.id, status: 'invalid-correction-profile',
            warnings: [`Invalid source correction profile: radius ${referenceRadius} m, refraction coefficient ${refractionCoefficient}.`] };
    }
    let curvatureCorrection = 0;
    const correctionStatus = correctionReference ? 'source-correction-referenced; curvature/refraction not reapplied'
        : 'curvature/refraction profile applied once; atmospheric ppm and prism constants are not reapplied';
    if (!correctionReference) curvatureCorrection = (1 - refractionCoefficient) * horizontalDistance ** 2 / (2 * referenceRadius);
    verticalDifference += curvatureCorrection;
    const point = {
        observationId: observation.id, pointId: observation.targetPointId, name: observation.targetName,
        setupId: setup.id, setupName: setup.stationName || setup.id, status: 'computed',
        e: stationPosition.e + horizontalDistance * Math.sin(azimuth),
        n: stationPosition.n + horizontalDistance * Math.cos(azimuth),
        z: stationPosition.z + setup.instrumentHeight + verticalDifference - (observation.targetHeight || 0),
        azimuth, horizontalDistance, slopeDistance: observation.slopeDistance, zenithAngle: zenith,
        verticalDifference, instrumentHeight: setup.instrumentHeight, targetHeight: observation.targetHeight || 0,
        curvatureCorrection, correctionStatus, referenceRadius, refractionCoefficient,
        sourcePosition: sourceTarget ? { e: sourceTarget.e, n: sourceTarget.n, z: sourceTarget.z } : null,
        purpose: observation.purpose, directFace: observation.directFace, warnings
    };
    if (sourceTarget) {
        point.residual = { e: point.e - sourceTarget.e, n: point.n - sourceTarget.n, z: point.z - sourceTarget.z };
        point.residual3d = Math.hypot(point.residual.e, point.residual.n, point.residual.z);
    }
    return point;
}

/** Reduce raw survey observations while preserving source coordinates and every individual shot. */
export function reduceSurvey(project, options = {}) {
    const config = {
        referenceRadius: options.referenceRadius ?? project.reductionProfile?.referenceRadius ?? 6371000,
        refractionCoefficient: options.refractionCoefficient ?? project.reductionProfile?.refractionCoefficient ?? 0.13,
        pointTolerance: options.pointTolerance ?? POINT_TOLERANCE,
        angleTolerance: options.angleTolerance ?? ANGLE_TOLERANCE,
        distanceTolerance: options.distanceTolerance ?? 0.01
    };
    requireFinite(config.referenceRadius, 'Earth reference radius');
    requireFinite(config.refractionCoefficient, 'Refraction coefficient');
    if (config.referenceRadius <= 0 || config.refractionCoefficient < 0 || config.refractionCoefficient >= 1) {
        throw new RangeError('Invalid curvature/refraction profile.');
    }
    const sourceById = new Map(project.sourcePoints.map(point => [positionKey(point.id), asPoint(point)]).filter(([, point]) => point));
    const knownPositions = new Map(sourceById);
    const pointById = new Map(project.sourcePoints.map(point => [positionKey(point.id), point]));
    const setupPositions = new Map();
    for (const setup of project.setups) {
        const point = sourceById.get(positionKey(setup.pointId));
        if (point) setupPositions.set(setup.id, point);
    }
    const stationResults = new Map(), shots = [], diagnostics = [], solved = new Set();
    const addDiagnostic = (code, message, setupId = null) => diagnostics.push({ severity: 'warning', code, message, setupId });
    const maxPasses = Math.max(1, project.setups.length + 1);
    for (let pass = 0; pass < maxPasses; pass++) {
        let progress = false;
        for (const setup of project.setups) {
            if (setup.kind !== 'survey' || solved.has(setup.id)) continue;
            const stationPosition = setupPositions.get(setup.id) || sourceById.get(positionKey(setup.pointId));
            if (!stationPosition) continue;
            const frame = observationFrame(project, setup, null, stationPosition, knownPositions, sourceById);
            const relevant = project.observations.filter(observation => observation.setupId === setup.id);
            const absolute = relevant.some(observation => observation.azimuth != null);
            if (frame.offset == null && !absolute) continue;
            const localShots = relevant.map(observation => reduceObservation(project, setup, observation, stationPosition, frame, config, pointById));
            shots.push(...localShots);
            const stationResult = { setupId: setup.id, pointId: setup.pointId, stationName: setup.stationName,
                status: 'resolved', stationPosition: { ...stationPosition }, orientationOffset: frame.offset,
                orientationSource: frame.source || (absolute ? 'absolute-observation-azimuth' : null),
                orientationResiduals: frame.sourceTargets.map(observation => {
                    const known = sourceById.get(positionKey(observation.targetPointId));
                    const reading = observationReading(observation);
                    return { observationId: observation.id,
                        residual: angleDifference(observation.azimuth == null ? reading + frame.offset : -observation.azimuth,
                            pointAzimuth(stationPosition, known)) };
                }) };
            stationResults.set(setup.id, stationResult);
            solved.add(setup.id);
            progress = true;
            const byTarget = new Map();
            for (const shot of localShots) {
                if (shot.status !== 'computed' || shot.purpose === 'check') continue;
                if (!byTarget.has(shot.pointId)) byTarget.set(shot.pointId, []);
                byTarget.get(shot.pointId).push(shot);
            }
            for (const [pointId, candidates] of byTarget) {
                const spread = Math.max(0, ...candidates.map(a => Math.max(...candidates.map(b => Math.hypot(a.e - b.e, a.n - b.n, a.z - b.z)))));
                if (spread > config.pointTolerance) {
                    addDiagnostic('repeated-shot-disagreement', `${candidates[0].name}: repeated shots differ by up to ${spread} m; no point adjustment was applied.`, setup.id);
                    continue;
                }
                if (!sourceById.has(positionKey(pointId))) {
                    const point = { e: candidates[0].e, n: candidates[0].n, z: candidates[0].z };
                    knownPositions.set(positionKey(pointId), point);
                    for (const dependent of project.setups.filter(candidate => candidate.pointId === pointId)) setupPositions.set(dependent.id, point);
                }
            }
        }
        if (!progress) break;
    }
    for (const setup of project.setups.filter(item => item.kind === 'survey')) {
        if (!stationResults.has(setup.id)) {
            const stationPosition = setupPositions.get(setup.id) || sourceById.get(positionKey(setup.pointId));
            if (stationPosition) {
                const frame = observationFrame(project, setup, null, stationPosition, knownPositions, sourceById);
                stationResults.set(setup.id, { setupId: setup.id, pointId: setup.pointId, stationName: setup.stationName,
                    stationPosition: { ...stationPosition }, status: 'unresolved-orientation', orientationSource: null });
                addDiagnostic('unresolved-orientation', `Station ${setup.stationName || setup.id} has no usable direction reference.`, setup.id);
                shots.push(...project.observations.filter(observation => observation.setupId === setup.id)
                    .map(observation => reduceObservation(project, setup, observation, stationPosition, frame, config, pointById)));
                continue;
            }
            stationResults.set(setup.id, { setupId: setup.id, pointId: setup.pointId, stationName: setup.stationName, status: 'unresolved-station' });
            addDiagnostic('unresolved-station', `Station ${setup.stationName || setup.id} has no known or reducible coordinates.`, setup.id);
            shots.push(...project.observations.filter(observation => observation.setupId === setup.id)
                .map(observation => ({ observationId: observation.id, pointId: observation.targetPointId, name: observation.targetName,
                    setupId: setup.id, status: 'unresolved-station', purpose: observation.purpose,
                    directionOnly: Boolean(observation.directionOnly), warnings: [] })));
        }
    }
    const surveySetups = project.setups.filter(setup => setup.kind === 'survey');
    const graph = new Map(surveySetups.map(setup => [setup.id, new Set()]));
    for (const setup of surveySetups) for (const observation of project.observations.filter(item => item.setupId === setup.id)) {
        for (const dependent of surveySetups.filter(item => item.pointId === observation.targetPointId)) {
            if (dependent.id !== setup.id) { graph.get(setup.id).add(dependent.id); graph.get(dependent.id).add(setup.id); }
        }
    }
    const visited = new Set();
    for (const setup of surveySetups) {
        if (visited.has(setup.id)) continue;
        const component = [], pending = [setup.id];
        while (pending.length) {
            const current = pending.pop();
            if (visited.has(current)) continue;
            visited.add(current); component.push(current);
            pending.push(...graph.get(current));
        }
        if (component.some(id => sourceById.has(positionKey(surveySetups.find(item => item.id === id).pointId)))) continue;
        addDiagnostic('disconnected-component', `Disconnected survey component has no station with exported coordinates: ${component.map(id => surveySetups.find(item => item.id === id).stationName || id).join(', ')}.`);
    }
    const goodShots = shots.filter(shot => shot.status === 'computed');
    for (const shot of goodShots) for (const warning of shot.warnings) addDiagnostic('observation-warning', `${shot.name}: ${warning}`, shot.setupId);
    const groups = new Map();
    for (const shot of goodShots) {
        if (!groups.has(shot.pointId)) groups.set(shot.pointId, []);
        groups.get(shot.pointId).push(shot);
    }
    const calculatedPoints = [];
    const sourcePointIds = new Set();
    for (const setup of project.setups.filter(item => item.kind === 'survey')) {
        const sourcePoint = pointById.get(positionKey(setup.pointId));
        if (!sourcePoint || sourcePointIds.has(positionKey(setup.pointId))) continue;
        sourcePointIds.add(positionKey(setup.pointId));
        if (!groups.has(setup.pointId)) calculatedPoints.push({ id: `source-${setup.pointId}`, pointId: setup.pointId,
            name: sourcePoint.name, e: sourcePoint.e, n: sourcePoint.n, z: sourcePoint.z,
            status: 'source-coordinate', coordinateSource: 'exported', sourcePosition: { e: sourcePoint.e, n: sourcePoint.n, z: sourcePoint.z },
            shotIds: [], shotCount: 0 });
    }
    for (const [pointId, pointShots] of groups) {
        const e = pointShots[0].e, n = pointShots[0].n, z = pointShots[0].z;
        const inconsistent = pointShots.some(shot => Math.hypot(shot.e - e, shot.n - n, shot.z - z) > config.pointTolerance);
        if (inconsistent) addDiagnostic('network-closure', `${pointShots[0].name}: repeated results differ; individual shots are preserved and no network adjustment was applied.`);
        calculatedPoints.push({ id: `calculated-${pointId}`, pointId, name: pointShots[0].name,
            ...(inconsistent ? {} : { e, n, z }), status: inconsistent ? 'inconsistent-shots' : 'computed',
            shotIds: pointShots.map(shot => shot.observationId), sourcePosition: pointShots[0].sourcePosition,
            shotCount: pointShots.length });
    }
    const residualShots = goodShots.filter(shot => shot.residual3d != null);
    const rms3d = residualShots.length ? Math.sqrt(residualShots.reduce((sum, shot) => sum + shot.residual3d ** 2, 0) / residualShots.length) : null;
    return { calculatedPoints, shots, stationResults: [...stationResults.values()], diagnostics,
        profile: { referenceRadius: config.referenceRadius, refractionCoefficient: config.refractionCoefficient,
            model: 'Local vertical correction: (1 - refraction coefficient) × horizontal distance² / (2 × reference radius).',
            atmosphericPpmApplied: false, prismConstantApplied: false },
        summary: { stations: stationResults.size, resolvedStations: [...stationResults.values()].filter(result => result.status === 'resolved').length,
            unresolvedStations: [...stationResults.values()].filter(result => result.status !== 'resolved').length,
            observations: project.observations.length, computedShots: goodShots.length,
            directionOnly: shots.filter(shot => shot.directionOnly || shot.status === 'direction-only').length,
            unresolvedOrientations: shots.filter(shot => shot.status === 'unresolved-orientation').length,
            points: new Set([...project.sourcePoints.map(point => positionKey(point.id)), ...calculatedPoints.map(point => positionKey(point.pointId))]).size,
            comparedShots: residualShots.length, rms3d }
    };
}
