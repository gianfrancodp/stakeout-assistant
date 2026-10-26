import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, importCsvProject, appendStakeout, prepareStakeout, removeFieldbookEntry, defaultPointHeight, validateConfigurationNumber } from '../src/model.mjs';
const csv='ST1,0,0,100,1.6\nOR1,0,10,100,0\nP1,3,4,100.5,1.8';
const selection={stationId:'point-1',orientationId:'point-2',targetId:'point-3',instrumentHeight:1.6,targetHeight:1.8};
function deepFreeze(object){Object.freeze(object);for(const value of Object.values(object))if(value&&typeof value==='object'&&!Object.isFrozen(value))deepFreeze(value);return object;}
test('Project separates coordinate frame, source points, setups and measured observations',()=>{
    const project=importCsvProject(createProject(),csv,'sample.csv');assert.equal(project.schemaVersion,1);assert.equal(project.revision,1);assert.equal(project.frame.axisOrder,'ENZ');assert.equal(project.units.angular,'radian');assert.equal(project.sourceFiles[0].name,'sample.csv');assert.equal(project.observations.length,0);
});
test('Invalid CSV never replaces or mutates the active project or fieldbook',()=>{
    const {project}=appendStakeout(importCsvProject(createProject(),csv),selection);const before=JSON.stringify(project);deepFreeze(project);
    assert.throws(()=>importCsvProject(project,'P1,,2,3,1.8'));assert.equal(JSON.stringify(project),before);
});
test('Repeated measurements of one point retain different target heights without changing ground coordinates',()=>{
    const project=importCsvProject(createProject(),csv);deepFreeze(project);
    const first=appendStakeout(project,selection),second=appendStakeout(first.project,{...selection,instrumentHeight:1.49,targetHeight:2.72});
    assert.equal(second.project.fieldbook[0].result.targetHeight,1.8);assert.equal(second.project.fieldbook[1].result.targetHeight,2.72);
    assert.equal(second.project.fieldbook[0].result.instrumentHeight,1.6);assert.equal(second.project.fieldbook[1].result.instrumentHeight,1.49);
    assert.deepEqual(second.project.sourcePoints,project.sourcePoints);assert.equal(defaultPointHeight(second.project,'point-3','target'),1.8);assert.equal(project.fieldbook.length,0);
});
test('New source increments revision while historical entries retain full input snapshots',()=>{
    const first=appendStakeout(importCsvProject(createProject(),csv),selection);
    const changed=importCsvProject(first.project,csv.replace('P1,3,4,100.5','P1,30,40,105'));
    assert.equal(changed.revision,2);assert.equal(changed.sourcePoints[2].e,30);assert.equal(changed.fieldbook[0].target.e,3);assert.equal(changed.fieldbook[0].sourceRevision,1);assert.equal(changed.setups.length,0);
});
test('Rejected configuration does not create setup or libretto rows',()=>{
    const project=importCsvProject(createProject(),csv);const before=JSON.stringify(project);
    assert.throws(()=>appendStakeout(project,{...selection,orientationId:selection.stationId}));assert.throws(()=>appendStakeout(project,{...selection,targetHeight:NaN}));assert.equal(JSON.stringify(project),before);
});
test('A preview calculation is pure; deleting one entry preserves all other results',()=>{
    const project=importCsvProject(createProject(),csv);const preview=prepareStakeout(project,selection);assert.equal(project.fieldbook.length,0);assert.ok(preview.result.slopeDistance>0);
    const first=appendStakeout(project,selection),second=appendStakeout(first.project,{...selection,targetHeight:2});
    const after=removeFieldbookEntry(second.project,first.entry.id);assert.equal(after.fieldbook.length,1);assert.equal(after.fieldbook[0].id,second.entry.id);assert.equal(after.setups.length,1);assert.equal(second.project.fieldbook.length,2);
});
test('Finite, nonempty configuration numbers are required, radius must be positive',()=>{
    for(const raw of ['',' ','NaN','Infinity','-1'])assert.throws(()=>validateConfigurationNumber(raw,'Height'));
    assert.equal(validateConfigurationNumber('0','Height'),0);assert.equal(validateConfigurationNumber('1.49','Height'),1.49);assert.throws(()=>validateConfigurationNumber('0','Radius',{positive:true}));
});
test('CSV height defaults retain precision beyond the table display decimals',()=>{
    const precise=importCsvProject(createProject(),csv.replace('100,1.6','100,1.23456789').replace('100.5,1.8','100.5,2.34567891'));
    const hi=defaultPointHeight(precise,'point-1','instrument'),ht=defaultPointHeight(precise,'point-3','target');
    assert.equal(hi,1.23456789);assert.equal(ht,2.34567891);
    const result=prepareStakeout(precise,{...selection,instrumentHeight:hi,targetHeight:ht}).result;
    assert.equal(result.instrumentHeight,1.23456789);assert.equal(result.targetHeight,2.34567891);
});
