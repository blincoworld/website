import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectPackage, money } from '../property-films/packages/catalog.mjs';
for (const [key,count,base,upgraded] of [['essential',1,49500,79000],['signature',1,79500,129000],['multi-property',1,79500,159000],['multi-property',2,119000,198500],['multi-property',3,158500,238000]]) {
 for (const seasonal of [false,true]) test(`${key}: ${count} properties, seasonal=${seasonal}`,()=>{
  const chosen=selectPackage(key,seasonal,count);
  assert.equal(chosen.total,seasonal?upgraded:base);
  assert.equal(chosen.propertyCount,count);
  assert.equal(chosen.lineItems.length,seasonal?2:1);
  assert.equal(chosen.lineItems[0].amount,base);
  assert.deepEqual(chosen.lineItems.map(l=>l.key),seasonal?[key,`${key}-seasonal`]:[key]);
  assert(chosen.lineItems.every(l=>l.quantity===1));
  assert.match(money(chosen.total),/^£/);
  assert.equal(selectPackage(key,false,count).total,base);
 });
}
test('invalid selections rejected',()=>{
 for(const key of ['unknown','__proto__','constructor']) assert.throws(()=>selectPackage(key),TypeError);
 assert.throws(()=>selectPackage('essential','true'),TypeError);
 for(const count of [0,4,-1,1.5,'2',NaN]) assert.throws(()=>selectPackage('multi-property',false,count),TypeError);
 assert.throws(()=>selectPackage('essential',false,2),TypeError);
 assert.throws(()=>selectPackage('signature',false,2),TypeError);
});
