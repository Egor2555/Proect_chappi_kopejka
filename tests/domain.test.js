const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTotalMinor, allocateProduction } = require('../src/domain');

test('money multiplication uses exact integer minor units', () => {
  assert.equal(calculateTotalMinor(125, 3), '375');
  assert.equal(calculateTotalMinor('199', 17), '3383');
});

test('negative money and quantity are rejected', () => {
  assert.throws(() => calculateTotalMinor(-1, 1), RangeError);
  assert.throws(() => calculateTotalMinor(1, -1), RangeError);
});

test('production first fills direct order, then priority queue, then free stock', () => {
  const result = allocateProduction(18, 5, [
    { id:'later', priority:1, createdAt:'2026-10-02T10:00:00Z', required:10, done:8 },
    { id:'top', priority:3, createdAt:'2026-10-03T10:00:00Z', required:8, done:2 },
    { id:'tie-old', priority:1, createdAt:'2026-10-01T10:00:00Z', required:6, done:0 }
  ]);
  assert.deepEqual(result, {
    allocations:[
      {orderId:'direct',quantity:5,type:'direct'},
      {orderId:'top',quantity:6,type:'surplus'},
      {orderId:'tie-old',quantity:6,type:'surplus'}
    ],
    freeStock:1
  });
});

test('no demand leaves all production as free stock', () => {
  assert.deepEqual(allocateProduction(7, 0, []), { allocations:[], freeStock:7 });
});
