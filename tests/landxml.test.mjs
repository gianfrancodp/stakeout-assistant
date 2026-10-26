import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
import { parseLandXML11, landxmlAngleToRadians, LandXMLValidationError } from '../src/io/landxml11.mjs';
import { createProject, importLandXMLProject, importSurveyProject, importCsvProject, defaultPointHeight, appendStakeout, removeFieldbookEntry } from '../src/model.mjs';
const options = { DOMParser };
const xml = fs.readFileSync(new URL('./fixtures/leica-minimal.land.xml', import.meta.url), 'utf8');
const parse = input => parseLandXML11(input, options);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10);
const pointsOnly = '<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.1" version="1.1"><Units><Metric linearUnit="meter" angularUnit="grads"/></Units><CgPoints><CgPoint name="S1" role="control point">2000 1000 100</CgPoint></CgPoints></LandXML>';

test('Leica 1.1 import maps N/E/Z to E/N/Z and preserves exported point coordinates', () => {
    const data = parse(xml);
    assert.deepEqual(data.summary, { documents: 1, points: 3, setups: 1, observations: 2, directionOnly: 1 });
    assert.deepEqual(data.points.find(point => point.name === 'P1'), { id: 'point-3', name: 'P1', n: 2004, e: 1003, z: 101.2, role: 'measured', coordinateSource: 'CgPoint' });
    assert.equal(data.source.text, xml);
});
test('Setup and raw observations keep separate heights, circle readings and correction references', () => {
    const data = parse(xml), setup = data.setups[0], raw = data.observations[1];
    assert.equal(setup.properties.find(property => property.label === 'type').value, 'knownAzimuth');
    assert.equal(setup.instrumentHeight, 1.49); assert.equal(raw.targetHeight, 1.8);
    close(setup.orientationAzimuth, Math.PI / 4); close(setup.circleAzimuth, Math.PI / 20);
    close(raw.horizontalAngle, Math.PI / 5); assert.equal(raw.slopeDistance, 5); assert.equal(raw.directFace, true);
    assert.equal(data.equipment[0].properties.find(property => property.label === 'referenceRadius').value, '6378000');
    assert.equal(raw.properties[0].value, 'correction-1');
});
test('Direction-only point has an identity but no invented ground coordinates', () => {
    const data = parse(xml), direction = data.observations[0];
    assert.equal(direction.directionOnly, true); assert.equal(direction.slopeDistance, null);
    assert.equal(data.points.some(point => point.name === '999'), false);
    assert.equal(data.pointReferences.find(point => point.name === '999').hasCoordinates, false);
});
test('BOM and DOS EOF-separated Leica documents merge coherent point records', () => {
    const data = parse('\uFEFF' + xml + '\n\x1a\n\uFEFF' + pointsOnly + '\x1a\n');
    assert.equal(data.summary.documents, 2); assert.equal(data.points.length, 3);
    assert.ok(data.diagnostics.some(item => item.code === 'concatenated-documents'));
});
test('Namespaced prefixed XML is supported', () => {
    const prefixed = xml.replace('xmlns=', 'xmlns:l=').replace(/<(\/?)([A-Z][\w]*)(?=[\s/>])/g, '<$1l:$2');
    assert.equal(parse(prefixed).observations.length, 2);
});
test('ObservationGroup inherits setupID outside the InstrumentSetup element', () => {
    const raw = xml.match(/<RawObservation setupID="setup-S1" purpose="normal"[\s\S]*?<\/RawObservation>/)[0];
    const grouped = xml.replace(raw, '').replace('</Survey>', `<ObservationGroup id="g" setupID="setup-S1">${raw.replace('setupID="setup-S1" ', '')}</ObservationGroup></Survey>`);
    assert.equal(parse(grouped).observations[1].setupId, 'document-1:setup-S1');
});
test('Point-only files can feed Cartesian stakeout without raw observations', () => {
    const data = parse(pointsOnly); assert.equal(data.points.length, 1); assert.equal(data.observations.length, 0);
});
test('Raw-only files preserve uncoordinated station/target identities for phase 3', () => {
    const rawOnly = xml.replace(/<CgPoints>[\s\S]*?<\/CgPoints>/, '').replace('>2004 1003 101.2</TargetPoint>', '></TargetPoint>');
    const data = parse(rawOnly); assert.equal(data.points.length, 0); assert.equal(data.observations.length, 2); assert.equal(data.setups[0].exportedPosition, null);
});
test('Linear units and target/instrument heights are normalised to metres', () => {
    const data = parse(xml.replace('linearUnit="meter"', 'linearUnit="millimeter"'));
    close(data.points[0].e, 1); close(data.setups[0].instrumentHeight, .00149); close(data.observations[1].slopeDistance, .005);
});
test('Declared direction units override the Leica angular-unit fallback', () => {
    const data = parse(xml.replace('angularUnit="grads"', 'angularUnit="grads" directionUnit="decimal degrees"'));
    close(data.setups[0].orientationAzimuth, 50 * Math.PI / 180); close(data.observations[1].horizontalAngle, 40 * Math.PI / 200);
});
test('Angle conversion supports gon, decimal degrees, radians and dd.mm.ss', () => {
    close(landxmlAngleToRadians(100, 'grads'), Math.PI / 2); close(landxmlAngleToRadians(90, 'decimal degrees'), Math.PI / 2);
    close(landxmlAngleToRadians(1, 'radians'), 1); close(landxmlAngleToRadians(12.3045, 'dd.mm.ss'), (12 + 30 / 60 + 45 / 3600) * Math.PI / 180);
    assert.throws(() => landxmlAngleToRadians(12.6099, 'dd.mm.ss'));
});
test('Face II readings are preserved without premature face correction', () => {
    const data = parse(xml.replace('zenithAngle="99"', 'zenithAngle="301"').replaceAll('directFace="true"', 'directFace="false"'));
    assert.equal(data.observations[1].directFace, false); close(data.observations[1].zenithAngle, 301 * Math.PI / 200);
});
test('TargetSetup references supply coordinates and heights when an observation has no TargetPoint', () => {
    const input = xml.replace(/<CgPoints>[\s\S]*?<\/CgPoints>/, '')
        .replace('purpose="normal" targetHeight="1.8"', 'purpose="normal" targetSetupID="target-P1"')
        .replace(/<TargetPoint name="P1"[\s\S]*?<\/TargetPoint>/, '')
        .replace('</Survey>', '<TargetSetup id="target-P1" targetHeight="2.72"><TargetPoint name="P1">2004 1003 101.2</TargetPoint></TargetSetup></Survey>');
    const data = parse(input);
    const point = data.points.find(point => point.name === 'P1');
    assert.equal(point.e, 1003); assert.equal(point.n, 2004); assert.equal(point.z, 101.2);
    assert.equal(data.observations[1].targetPointId, point.id);
    assert.equal(data.observations[1].targetHeight, 2.72);
    assert.equal(data.pointDefaults[point.id].targetHeight, 2.72);
});
for (const [name, input] of [
    ['empty input', ''], ['malformed XML', '<LandXML>'], ['wrong version', xml.replace('version="1.1"', 'version="1.2"')],
    ['wrong namespace', xml.replace('schema/LandXML-1.1', 'schema/other')], ['unsupported linear unit', xml.replace('linearUnit="meter"', 'linearUnit="furlong"')],
    ['unsupported angle unit', xml.replace('angularUnit="grads"', 'angularUnit="unknown"')], ['nonfinite coordinate', xml.replace('2000 1000 100', '2000 Infinity 100')],
    ['missing third coordinate', xml.replace('2000 1000 100', '2000 1000')], ['negative distance', xml.replace('slopeDistance="5"', 'slopeDistance="-5"')],
    ['negative height', xml.replace('instrumentHeight="1.49"', 'instrumentHeight="-1"')], ['unknown setup', xml.replace('setupID="setup-S1"', 'setupID="missing"')],
    ['missing direction', xml.replace('horizAngle="40"', '')], ['invalid zenith', xml.replace('zenithAngle="99"', 'zenithAngle="401"')],
    ['invalid boolean', xml.replace('directFace="true"', 'directFace="perhaps"')], ['unknown equipment', xml.replace('instrumentDetailsID="TS02"', 'instrumentDetailsID="missing"')],
    ['unknown target setup', xml.replace('purpose="normal"', 'purpose="normal" targetSetupID="missing"')],
    ['offsets', xml.replace('<TargetPoint name="999"/>', '<TargetPoint name="999"/><OffsetVals/>')],
    ['DTD', '<!DOCTYPE LandXML>' + xml], ['external entity', '<!ENTITY x SYSTEM "https://example.invalid">' + xml],
    ['duplicate setups', xml.replace('</Survey>', xml.match(/<InstrumentSetup[\s\S]*?<\/InstrumentSetup>/)[0] + '</Survey>')],
    ['conflicting catalogs', xml + '\x1a' + pointsOnly.replace('2000 1000 100', '2000 1001 100')]
]) test(`Rejects ${name} before project replacement`, () => assert.throws(() => parse(input), LandXMLValidationError));

test('LandXML import is atomic and retains prior fieldbook snapshots', () => {
    let project = importCsvProject(createProject(), 'A,0,0,100,1.6\nB,0,10,100,0\nC,3,4,100,1.8');
    project = appendStakeout(project, { stationId: 'point-1', orientationId: 'point-2', targetId: 'point-3', instrumentHeight: 1.6, targetHeight: 1.8 }).project;
    const before = JSON.stringify(project);
    assert.throws(() => importLandXMLProject(project, '<bad>', 'bad.xml', options)); assert.equal(JSON.stringify(project), before);
    const imported = importLandXMLProject(project, xml, 'example.xml', options);
    assert.equal(imported.revision, 2); assert.equal(imported.fieldbook[0].station.name, 'A'); assert.equal(imported.observations.length, 2);
    assert.equal(imported.calculatedPoints.length, 0);
});
test('Unified dispatch supports XML paste, XML uploads and existing CSV', () => {
    const project = createProject();
    assert.equal(importSurveyProject(project, xml, 'manual', options).sourceFiles[0].format, 'landxml');
    assert.equal(importSurveyProject(project, pointsOnly, 'points.landxml', options).sourcePoints.length, 1);
    assert.equal(importSurveyProject(project, 'A,1,2,3', 'points.csv', options).sourceFiles[0].format, 'csv');
});
test('Removing stakeout rows never removes the imported survey setups', () => {
    const imported = importLandXMLProject(createProject(), xml, 'test.xml', options);
    const added = appendStakeout(imported, { stationId: 'point-1', orientationId: 'point-2', targetId: 'point-3', instrumentHeight: 1.49, targetHeight: 1.8 });
    assert.equal(removeFieldbookEntry(added.project, added.entry.id).setups.length, 1);
    assert.equal(removeFieldbookEntry(added.project, added.entry.id).observations.length, 2);
});
test('Reimporting CSV clears survey metadata while keeping historical rows', () => {
    const imported = importLandXMLProject(createProject(), xml, 'test.xml', options);
    const csv = importCsvProject(imported, 'A,1,2,3');
    assert.equal(csv.equipment.length, 0); assert.equal(csv.sourcePointReferences.length, 0); assert.equal(csv.importSummary, null); assert.equal(csv.observations.length, 0);
});
test('Different heights on repeated targets cannot silently become a single default', () => {
    const raw = xml.match(/<RawObservation setupID="setup-S1" purpose="normal"[\s\S]*?<\/RawObservation>/)[0];
    const imported = importLandXMLProject(createProject(), xml.replace('</InstrumentSetup>', raw.replace('targetHeight="1.8"', 'targetHeight="2.72"') + '</InstrumentSetup>'), 'test.xml', options);
    assert.equal(imported.observations.length, 3); assert.ok(imported.diagnostics.some(item => item.code === 'ambiguous-height'));
    assert.throws(() => defaultPointHeight(imported, 'point-3', 'target'), /Multiple target heights/);
});
test('Imported survey setup references and remaining stakeout IDs stay unique after deletion', () => {
    let project = importLandXMLProject(createProject(), xml, 'test.xml', options);
    const selection = { stationId: 'point-1', orientationId: 'point-2', targetId: 'point-3', instrumentHeight: 1.49, targetHeight: 1.8 };
    project = appendStakeout(project, selection).project;
    const firstId = project.fieldbook[0].id;
    project = appendStakeout(project, selection).project;
    project = removeFieldbookEntry(project, firstId);
    project = appendStakeout(project, selection).project;
    assert.equal(new Set(project.setups.map(setup => setup.id)).size, project.setups.length);
    assert.equal(project.observations[0].setupId, project.setups[0].id);
});
