import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceSurvey } from '../src/core/survey-reduction.mjs';

const setup = (id, pointId, stationName, backsights = [], extra = {}) => ({ id, pointId, stationName, kind: 'survey', instrumentHeight: 1, horizontalAngleConvention: 'clockwise-from-north', backsights, ...extra });
const observation = (id, setupId, pointId, targetName, horiz, slope = 10, zenith = 100, extra = {}) => ({
    id, setupId, targetPointId: pointId, targetName, purpose: 'normal', horizontalAngle: horiz * Math.PI / 200,
    horizontalAngleConvention: 'clockwise-from-north', azimuth: null, slopeDistance: slope, zenithAngle: zenith * Math.PI / 200,
    horizontalDistance: null, verticalDistance: null, targetHeight: 0, directFace: true, properties: [], ...extra
});
const sourcePoints = [
    { id: 'A', name: 'A', e: 0, n: 0, z: 100 },
    { id: 'N', name: 'N', e: 0, n: 10, z: 100 }
];
const close = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('Resolves three traverse stations when setup records are out of order', () => {
    const project = { sourcePoints, equipment: [],
        setups: [
            setup('C-setup', 'C', 'C', [{ pointId: 'B', circle: 300 * Math.PI / 200 }], { instrumentHeight: 2 }),
            setup('B-setup', 'B', 'B', [{ pointId: 'A', circle: 300 * Math.PI / 200 }], { instrumentHeight: 1.5 }),
            setup('A-setup', 'A', 'A', [{ pointId: 'N', circle: 0 }], { instrumentHeight: 1 })
        ],
        observations: [
            observation('C-D', 'C-setup', 'D', 'D', 100, 10, 100, { targetHeight: .25 }),
            observation('B-C', 'B-setup', 'C', 'C', 100, 10, 100, { targetHeight: .5 }),
            observation('A-B', 'A-setup', 'B', 'B', 100, 10, 100, { targetHeight: .5 })
        ] };
    const result = reduceSurvey(project, { referenceRadius: 1e20 });
    assert.equal(result.summary.resolvedStations, 3);
    assert.equal(result.summary.unresolvedStations, 0);
    const byName = Object.fromEntries(result.calculatedPoints.map(point => [point.name, point]));
    close(byName.B.e, 10); close(byName.B.n, 0); close(byName.B.z, 100.5);
    close(byName.C.e, 20); close(byName.C.n, 0); close(byName.C.z, 101.5);
    close(byName.D.e, 30); close(byName.D.n, 0); close(byName.D.z, 103.25);
    assert.deepEqual(project.sourcePoints[0], { id: 'A', name: 'A', e: 0, n: 0, z: 100 });
    const twoStation = reduceSurvey({ ...project,
        setups: project.setups.filter(item => ['A-setup', 'B-setup'].includes(item.id)),
        observations: project.observations.filter(item => ['A-B', 'B-C'].includes(item.id))
    }, { referenceRadius: 1e20 });
    assert.equal(twoStation.summary.resolvedStations, 2);
});

test('Converts generic LandXML angle origin and applies nonzero orientation from control points', () => {
    const project = { sourcePoints: [
        { id: 'A', name: 'A', e: 0, n: 0, z: 100 },
        { id: 'Q', name: 'Q', e: 0, n: 10, z: 100 },
        { id: 'P', name: 'P', e: 10, n: 0, z: 100 }
    ], equipment: [], setups: [setup('s', 'A', 'A', [], { horizontalAngleConvention: 'counterclockwise-from-east' })],
    observations: [observation('to-Q', 's', 'Q', 'Q', 100, null, null, { slopeDistance: null, zenithAngle: null, horizontalDistance: 5, verticalDistance: 0, horizontalAngleConvention: 'counterclockwise-from-east' }),
        observation('to-P', 's', 'P', 'P', 0, null, null, { slopeDistance: null, zenithAngle: null, horizontalDistance: 10, verticalDistance: 0, horizontalAngleConvention: 'counterclockwise-from-east' })] };
    const result = reduceSurvey(project, { referenceRadius: 1e20 });
    assert.equal(result.summary.resolvedStations, 1);
    const qShot = result.shots.find(shot => shot.name === 'Q');
    const pShot = result.shots.find(shot => shot.name === 'P');
    close(qShot.e, 0); close(qShot.n, 5); close(pShot.e, 10); close(pShot.n, 0);
    assert.equal(result.stationResults[0].orientationSource, 'exported-coordinate-checks');
});

test('Applies a nonzero circle-to-grid orientation offset to uncoordinated targets', () => {
    const radians = angle => angle * Math.PI / 200;
    const knownAzimuth = radians(110), horizontalAngle = radians(100), targetAzimuth = radians(150);
    const project = { sourcePoints: [
        { id: 'A', name: 'A', e: 0, n: 0, z: 10 },
        { id: 'B', name: 'B', e: 10 * Math.sin(knownAzimuth), n: 10 * Math.cos(knownAzimuth), z: 10 }
    ], equipment: [], setups: [setup('s', 'A', 'A')], observations: [
        observation('orientation-check', 's', 'B', 'B', 100, 10, 100),
        observation('target', 's', 'X', 'X', 150, 10, 100)
    ] };
    const result = reduceSurvey(project, { referenceRadius: 1e20 });
    close(result.stationResults[0].orientationOffset, radians(10));
    close(result.shots.find(shot => shot.name === 'X').e, 10 * Math.sin(radians(160)));
    close(result.shots.find(shot => shot.name === 'X').n, 10 * Math.cos(radians(160)));
});

test('Normalizes face II horizontal and zenith readings exactly once and applies target heights', () => {
    const project = { sourcePoints, equipment: [], setups: [setup('s', 'A', 'A', [{ pointId: 'N', circle: 0 }], { instrumentHeight: 1.2 })],
        observations: [observation('face-II', 's', 'X', 'X', 300, 10, 300, { directFace: false, targetHeight: .3 })] };
    const result = reduceSurvey(project, { referenceRadius: 1e20 });
    const shot = result.shots[0];
    close(shot.e, 10); close(shot.n, 0); close(shot.z, 100.9);
    assert.equal(shot.directFace, false);
});

test('Uses absolute LandXML azimuth, retains source coordinates, and reports shot residuals', () => {
    const project = { sourcePoints: [
        { id: 'A', name: 'A', e: 0, n: 0, z: 10 },
        { id: 'P', name: 'P', e: 10, n: 0, z: 10 }
    ], equipment: [], setups: [setup('s', 'A', 'A', [], { instrumentHeight: 0 })], observations: [
        observation('az', 's', 'P', 'P', null, 10, 100, { horizontalAngle: null, azimuth: 3 * Math.PI / 2, horizontalDistance: 10, verticalDistance: 0 })
    ] };
    const result = reduceSurvey(project, { referenceRadius: 1e20 });
    close(result.shots[0].e, 10); close(result.shots[0].n, 0);
    assert.deepEqual(result.shots[0].sourcePosition, { e: 10, n: 0, z: 10 });
    close(result.shots[0].residual3d, 0);
    assert.equal(project.sourcePoints[1].e, 10);
});

test('Preserves repeated shots and check observations without averaging a closure', () => {
    const project = { sourcePoints: [
        ...sourcePoints, { id: 'P', name: 'P', e: 10, n: 0, z: 100 }
    ], equipment: [], setups: [setup('s', 'A', 'A', [{ pointId: 'N', circle: 0 }])],
    observations: [
        observation('p1', 's', 'P', 'P', 100, 10, 100),
        observation('p2', 's', 'P', 'P', 100.02, 10, 100),
        observation('check', 's', 'P', 'P', 100, 10, 100, { purpose: 'check' })
    ] };
    const result = reduceSurvey(project, { referenceRadius: 1e20, pointTolerance: 0.0001 });
    assert.equal(result.shots.length, 3);
    assert.equal(result.shots.filter(shot => shot.purpose === 'check').length, 1);
    assert.equal(result.calculatedPoints.find(point => point.pointId === 'P').status, 'inconsistent-shots');
    assert.ok(result.diagnostics.some(item => item.code === 'network-closure'));
    assert.equal(result.calculatedPoints.find(point => point.pointId === 'P').shotCount, 3);
});

test('Reports unresolved station and direction-only observations without inventing coordinates', () => {
    const project = { sourcePoints: [], equipment: [], setups: [setup('unknown', 'A', 'A')], observations: [
        observation('direction', 'unknown', 'P', 'P', 20, null, null, { slopeDistance: null, zenithAngle: null, directionOnly: true })
    ] };
    const result = reduceSurvey(project);
    assert.equal(result.summary.unresolvedStations, 1);
    assert.equal(result.summary.computedShots, 0);
    assert.equal(result.shots[0].status, 'unresolved-station');
    assert.equal(result.shots[0].directionOnly, true);
    assert.equal(result.summary.directionOnly, 1);
    assert.equal(result.calculatedPoints.length, 0);
    assert.ok(result.diagnostics.some(item => item.code === 'unresolved-station'));
    assert.ok(result.diagnostics.some(item => item.code === 'disconnected-component'));
});

test('Rejects coincident orientation controls and reports the station orientation unresolved', () => {
    const project = { sourcePoints: [
        { id: 'A', name: 'A', e: 0, n: 0, z: 0 }, { id: 'Q', name: 'Q', e: 0, n: 0, z: 5 }
    ], equipment: [], setups: [setup('s', 'A', 'A')], observations: [
        observation('coincident', 's', 'Q', 'Q', 0, 5, 100)
    ] };
    const result = reduceSurvey(project);
    assert.equal(result.stationResults[0].status, 'unresolved-orientation');
    assert.equal(result.shots[0].status, 'unresolved-orientation');
    assert.ok(result.diagnostics.some(item => item.code === 'unresolved-orientation'));
});

for (const controlBecomesKnown of [true, false]) test(`Emits each observation once when a pending orientation ${controlBecomesKnown ? 'resolves on a later pass' : 'remains unresolved'}`, () => {
    const project = { sourcePoints, equipment: [], setups: [
        setup('pending', 'A', 'A'),
        setup('anchored', 'N', 'N', [], { orientationAzimuth: 0 })
    ], observations: [
        observation('pending-control', 'pending', 'Q', 'Q', 50, Math.sqrt(200), 100, { targetHeight: 1 }),
        observation('pending-detail', 'pending', 'X', 'X', 100),
        observation('known-detail', 'anchored', controlBecomesKnown ? 'Q' : 'R', controlBecomesKnown ? 'Q' : 'R', 100, 10, 100, { targetHeight: 1 })
    ] };
    const result = reduceSurvey(project, { referenceRadius: 1e20 });
    assert.equal(result.shots.length, project.observations.length);
    assert.equal(new Set(result.shots.map(shot => shot.observationId)).size, project.observations.length);
    assert.equal(result.summary.computedShots, controlBecomesKnown ? 3 : 1);
    assert.equal(result.summary.unresolvedStations, controlBecomesKnown ? 0 : 1);
    assert.equal(result.diagnostics.filter(item => item.code === 'unresolved-orientation').length, controlBecomesKnown ? 0 : 1);
});

test('Applies the TS02 vertical curvature/refraction model and never reapplies PPM or prism corrections', () => {
    const base = { sourcePoints, equipment: [], setups: [setup('s', 'A', 'A', [{ pointId: 'N', circle: 0 }])], observations: [
        observation('p', 's', 'P', 'P', 100, 1000, 100)
    ] };
    const result = reduceSurvey(base, { referenceRadius: 6371000, refractionCoefficient: .13 });
    close(result.shots[0].curvatureCorrection, .87 * 1000 ** 2 / (2 * 6371000));
    assert.equal(result.profile.atmosphericPpmApplied, false);
    assert.equal(result.profile.prismConstantApplied, false);
    const alreadyCorrected = reduceSurvey({ ...base, observations: [{ ...base.observations[0], properties: [{ label: 'TPSCorrectionRef', value: 'C1' }] }] });
    assert.equal(alreadyCorrected.shots[0].curvatureCorrection, 0);
    assert.match(alreadyCorrected.shots[0].correctionStatus, /not reapplied/);
});

test('Rejects invalid curvature/refraction profiles', () => {
    const project = { sourcePoints: [], setups: [], observations: [] };
    for (const profile of [{ referenceRadius: 0 }, { refractionCoefficient: 1 }, { refractionCoefficient: -0.1 }]) {
        assert.throws(() => reduceSurvey(project, profile));
    }
});
