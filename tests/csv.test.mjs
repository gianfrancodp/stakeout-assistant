import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePointsCsv, CsvValidationError, fieldbookToCsv } from '../src/io/csv.mjs';
import { createProject, importCsvProject, appendStakeout } from '../src/model.mjs';
const example='ST1,0,0,100,1.6\nOR1,0,10,100,0\nP1,1,2,100.7,1.8';
test('Legacy CSV uses metres and X=East, Y=North, with separate height defaults',()=>{
    const parsed=parsePointsCsv('100,58015.6241,-28942.0209,338.4,1.35\n101,58122.6924,-29031.5002,338.65,5');
    assert.equal(parsed.points[0].e,58015.6241);assert.equal(parsed.points[0].n,-28942.0209);assert.equal(parsed.pointDefaults['point-1'].instrumentHeight,1.35);
    assert.equal(parsed.pointDefaults['point-1'].targetHeight,1.35);assert.ok(!Object.hasOwn(parsed.points[0],'height'));
});
test('Header, BOM, CRLF, spaces and optional height',()=>{
    const parsed=parsePointsCsv('\uFEFFName,X,Y,Z,h\r\n A ,1,2,3,\r\n\r\nB,4,5,6\r\n');
    assert.equal(parsed.points.length,2);assert.equal(parsed.points[0].name,'A');assert.equal(parsed.pointDefaults['point-1'].targetHeight,0);assert.equal(parsed.pointDefaults['point-2'].instrumentHeight,0);
});
test('Quoted names with commas and escaped quotes are read correctly',()=>{
    const parsed=parsePointsCsv('"P, ""A""",1,2,3,1.6');assert.equal(parsed.points[0].name,'P, "A"');
});
test('Line numbers remain correct after blank and quoted multiline records',()=>{
    assert.throws(()=>parsePointsCsv('Name,X,Y,Z,h\n\n"P\nA",1,2,3,1.6\nBad,,2,3,1.8'),error=>error instanceof CsvValidationError&&error.issues.some(issue=>issue.line===5));
});
for(const [name,text] of [
    ['empty X','A,,2,3,1.5'],['empty Y','A,1,,3,1.5'],['empty Z','A,1,2,,1.5'],['empty name',',1,2,3,1.5'],
    ['infinite exponent','A,1e400,2,3,1.5'],['Infinity literal','A,Infinity,2,3,1.5'],['NaN','A,NaN,2,3,1.5'],
    ['hexadecimal','A,0x10,2,3,1.5'],['invalid height','A,1,2,3,NaN'],['negative height','A,1,2,3,-1'],
    ['too many columns','A,1,2,3,1,5'],['missing columns','A,1,2'],['duplicate names','A,1,2,3\nA,2,3,4'],
    ['unclosed quotes','"A,1,2,3'],['invalid quotes','A"B,1,2,3'],['trailing quoted text','"A"bad,1,2,3'],
    ['comma-only row','A,1,2,3\n,,,'],['empty text',' \n'],['header only','Name,X,Y,Z,h\n']
])test(`Rejects ${name}`,()=>assert.throws(()=>parsePointsCsv(text),CsvValidationError));
test('XML is rejected explicitly before CSV import',()=>{
    for(const xml of ['<?xml version="1.0"?><LandXML/>','\uFEFF <LandXML version="1.1"/>'])assert.throws(()=>parsePointsCsv(xml),/LandXML non disponibile nella fase 1/);
});
test('Multiple row errors are reported together',()=>{
    assert.throws(()=>parsePointsCsv('A,,2,3\nB,1,no,3\nC,1,2,no'),error=>error.issues.length===3&&error.issues[2].line===3);
});
test('Export preserves leading legacy columns, precision and immutable heights',()=>{
    let project=importCsvProject(createProject(),example);
    const added=appendStakeout(project,{stationId:'point-1',orientationId:'point-2',targetId:'point-3',instrumentHeight:1.49,targetHeight:2.72});project=added.project;
    const csv=fieldbookToCsv(project.fieldbook,project.revision),lines=csv.slice(1).split('\r\n');
    assert.ok(lines[0].startsWith('Station,Point,Azimuth,Zenith,Distance,Target Height,'));
    assert.equal(Number(lines[1].split(',')[4]),added.entry.result.slopeDistance);
    assert.notEqual(String(added.entry.result.slopeDistance),added.entry.result.slopeDistance.toFixed(3));
    assert.equal(Number(lines[1].split(',')[5]),2.72);assert.equal(Number(lines[1].split(',')[6]),1.49);assert.ok(lines[1].endsWith('current'));
});
test('CSV escapes names and protects formula-like identifiers',()=>{
    const parsedProject=importCsvProject(createProject(),'"=ST,1",0,0,0,0\nOR1,0,10,0,0\n"P""1",1,2,0,0');
    const added=appendStakeout(parsedProject,{stationId:'point-1',orientationId:'point-2',targetId:'point-3',instrumentHeight:0,targetHeight:0});
    const csv=fieldbookToCsv(added.project.fieldbook,added.project.revision);assert.ok(csv.includes('"\'=ST,1"'));assert.ok(csv.includes('"P""1"'));
});
