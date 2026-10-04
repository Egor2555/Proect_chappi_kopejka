const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseHappyKopeckWinner } = require('../src/penny');

test('Happy Kopeck has no winner when there is no residual', () => {
  assert.deepEqual(chooseHappyKopeckWinner('0', ['a','b']), {
    amountMinor:'0', winnerId:null, badge:null
  });
});

test('Happy Kopeck chooses only from eligible workers', () => {
  for (let i=0;i<20;i++) {
    const result=chooseHappyKopeckWinner('1', ['a','b','c']);
    assert.ok(['a','b','c'].includes(result.winnerId));
    assert.equal(result.amountMinor,'1');
    assert.equal(result.badge,'Счастливая копейка от Чаппи 🪙🏆');
  }
});

test('Happy Kopeck rejects a positive residual without eligible workers', () => {
  assert.throws(() => chooseHappyKopeckWinner('1', []), /No eligible workers/);
});
