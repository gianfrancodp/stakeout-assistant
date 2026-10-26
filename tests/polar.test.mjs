import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateAzimuth, calculatePolar, reduceToSeaLevel } from '../src/core/polar.mjs';
import { normalizeAngle, radiansToGon, gonToRadians, kilometresToMetres } from '../src/core/units.mjs';
const close=(actual,expected,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
const station={e:0,n:0,z:100},orientation={e:0,n:10,z:100};
const base={station,orientation,target:{e:3,n:4,z:112},instrumentHeight:1.6,targetHeight:1.6};
const legacy=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-results.json',import.meta.url),'utf8'));
for(const sample of legacy.cases)test(`Matches upstream: ${sample.name}`,()=>{
    const p=point=>({e:point.x,n:point.y,z:point.z});
    const result=calculatePolar({station:p(sample.station),orientation:p(sample.orientation),target:p(sample.target),instrumentHeight:sample.station.height,targetHeight:sample.target.height,earthRadius:sample.earthRadiusKm*1000});
    const mapping={orientationAzimuth:'orientAzimuth',targetAzimuth:'targetAzimuth',relativeAzimuth:'relativeAzimuth',zenithAngle:'zenithAngleGon'};
    for(const [current,old] of Object.entries(mapping))close(radiansToGon(result[current]),sample.expected[old]);
    for(const [current,old] of Object.entries({horizontalDistance:'horizontalDistance',slopeDistance:'totalDistance',seaLevelHorizontalDistance:'seaLevelDistance',seaLevelScaleFactor:'scaleFactor',verticalDifference:'dz'}))close(result[current],sample.expected[old]);
});
test('Cardinal directions are clockwise from North in gon',()=>{
    for(const [e,n,expected] of [[0,1,0],[1,0,100],[0,-1,200],[-1,0,300]])close(radiansToGon(calculateAzimuth(station,{e,n,z:100})),expected);
});
test('Known inclined triangle has 5 m horizontal and 13 m slope distance',()=>{const result=calculatePolar(base);close(result.horizontalDistance,5);close(result.slopeDistance,13);close(result.verticalDifference,12);close(result.zenithAngle,Math.atan2(5,12));});
test('Independent instrument and target heights affect vertical geometry only',()=>{
    const initial=calculatePolar(base),changed=calculatePolar({...base,instrumentHeight:2.4,targetHeight:.5});
    close(initial.verticalDifference-changed.verticalDifference,1.9);close(initial.relativeAzimuth,changed.relativeAzimuth);close(initial.horizontalDistance,changed.horizontalDistance);
    assert.deepEqual(station,{e:0,n:0,z:100});
});
test('Horizon gives zenith 100 gon when instrument and target elevations match',()=>{
    const result=calculatePolar({...base,target:{e:12,n:0,z:100},targetHeight:1.6});close(radiansToGon(result.zenithAngle),100);close(result.slopeDistance,12);
});
test('Relative direction wraps correctly through north and a full circle',()=>{
    const result=calculatePolar({...base,orientation:{e:-1,n:100,z:100},target:{e:1,n:100,z:100}});assert.ok(radiansToGon(result.relativeAzimuth)>0&&radiansToGon(result.relativeAzimuth)<2);
    for(const value of [-15,0,1,400,1201])close(radiansToGon(normalizeAngle(gonToRadians(value))),((value%400)+400)%400);
    close(kilometresToMetres(6371),6371000);
});
test('Coincident orientation, target and non-finite coordinates are rejected',()=>{
    assert.throws(()=>calculatePolar({...base,orientation:{...station}}),/azimuth is undefined/);
    assert.throws(()=>calculatePolar({...base,target:{...station,z:200}}),/azimuth is undefined/);
    for(const invalid of [NaN,Infinity,-Infinity,undefined,'3'])assert.throws(()=>calculatePolar({...base,target:{e:invalid,n:4,z:100}}));
});
test('No negative, missing or infinite instrument/target heights',()=>{
    for(const value of [-1,NaN,Infinity,undefined,'']){
        assert.throws(()=>calculatePolar({...base,instrumentHeight:value}));assert.throws(()=>calculatePolar({...base,targetHeight:value}));
    }
});
test('Sea-level reduction is a separate result and rejects invalid radii',()=>{
    const a=calculatePolar(base),b=calculatePolar({...base,earthRadius:6378000});close(a.slopeDistance,b.slopeDistance);close(a.horizontalDistance,b.horizontalDistance);assert.notEqual(a.seaLevelHorizontalDistance,b.seaLevelHorizontalDistance);
    close(reduceToSeaLevel(100,0,6371000),100);
    for(const radius of [0,-1,NaN,Infinity])assert.throws(()=>calculatePolar({...base,earthRadius:radius}));
    assert.throws(()=>reduceToSeaLevel(100,-6371000,6371000));
});
test('Angles and overflowing coordinates are validated without loops',()=>{
    assert.throws(()=>normalizeAngle(Infinity));assert.throws(()=>normalizeAngle(NaN));
    assert.throws(()=>calculatePolar({...base,station:{e:-1e308,n:0,z:0},target:{e:1e308,n:4,z:0}}));
});
