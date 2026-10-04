const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateMonthlyWorkerEarnings, allocateProduction } = require('../src/domain');

test('monthly earnings split each production day by actual workers', () => {
  const result = calculateMonthlyWorkerEarnings([
    { date:'2026-10-01', teamId:'team', totalMinor:'100', workerIds:['a','b','c'] },
    { date:'2026-10-02', teamId:'team', totalMinor:'80', workerIds:['a','b'] }
  ]);
  assert.equal(result.residualMinor, '1');
  const totals = new Map(result.earnings.map(x => [x.workerId, x.amountMinor]));
  assert.equal(totals.get('a'), '73');
  assert.equal(totals.get('b'), '73');
  assert.equal(totals.get('c'), '33');
});

test('production surplus follows priority and then created order', () => {
  const result = allocateProduction(12, 4, [
    { id:'later-high', required:5, done:0, priority:10, createdAt:'2026-10-02' },
    { id:'older-high', required:6, done:0, priority:10, createdAt:'2026-10-01' },
    { id:'low', required:9, done:0, priority:1, createdAt:'2026-10-01' }
  ]);
  assert.deepEqual(result.allocations, [
    { orderId:'direct', quantity:4, type:'direct' },
    { orderId:'older-high', quantity:6, type:'surplus' },
    { orderId:'later-high', quantity:2, type:'surplus' }
  ]);
  assert.equal(result.freeStock, 0);
});

test('monthly earnings reject a production day without workers', () => {
  assert.throws(() => calculateMonthlyWorkerEarnings([
    { date:'2026-10-01', teamId:'team', totalMinor:'10', workerIds:[] }
  ]), /at least one worker/);
});
