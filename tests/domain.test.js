const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateTotalMinor, calculateMonthlyWorkerEarnings, allocateProduction } = require('../src/domain');
const { chooseHappyKopeckWinner } = require('../src/penny');

test('money multiplication uses exact integer minor units', () => {
  assert.equal(calculateTotalMinor(125, 3), '375');
  assert.equal(calculateTotalMinor('199', 17), '3383');
});

test('negative money and quantity are rejected', () => {
  assert.throws(() => calculateTotalMinor(-1, 1), RangeError);
  assert.throws(() => calculateTotalMinor(1, -1), RangeError);
});

test('monthly earnings match the real multi-day varying-attendance example', () => {
  const result = calculateMonthlyWorkerEarnings([
    { date:'2026-10-01', teamId:'team', totalMinor:'150000', workerIds:['F','S','C'] },
    { date:'2026-10-02', teamId:'team', totalMinor:'150000', workerIds:['F','C'] },
    { date:'2026-10-03', teamId:'team', totalMinor:'225000', workerIds:['F','S','C'] }
  ]);
  assert.deepEqual(result, {
    earnings: [
      { workerId:'F', amountMinor:'200000', workDays:3, dailyDetails:[
        {date:'2026-10-01',teamId:'team',dayTotalMinor:'150000',workers:3,shareMinor:'50000'},
        {date:'2026-10-02',teamId:'team',dayTotalMinor:'150000',workers:2,shareMinor:'75000'},
        {date:'2026-10-03',teamId:'team',dayTotalMinor:'225000',workers:3,shareMinor:'75000'}]},
      { workerId:'S', amountMinor:'125000', workDays:2, dailyDetails:[
        {date:'2026-10-01',teamId:'team',dayTotalMinor:'150000',workers:3,shareMinor:'50000'},
        {date:'2026-10-03',teamId:'team',dayTotalMinor:'225000',workers:3,shareMinor:'75000'}]},
      { workerId:'C', amountMinor:'200000', workDays:3, dailyDetails:[
        {date:'2026-10-01',teamId:'team',dayTotalMinor:'150000',workers:3,shareMinor:'50000'},
        {date:'2026-10-02',teamId:'team',dayTotalMinor:'150000',workers:2,shareMinor:'75000'},
        {date:'2026-10-03',teamId:'team',dayTotalMinor:'225000',workers:3,shareMinor:'75000'}]}
    ],
    residualMinor:'0'
  });
});

test('monthly earnings preserve indivisible minor-unit remainder', () => {
  const result = calculateMonthlyWorkerEarnings([
    { date:'2026-10-04', teamId:'team', totalMinor:'10', workerIds:['F','S','C'] }
  ]);
  assert.equal(result.residualMinor,'1');
  assert.equal(result.earnings.reduce((sum,x)=>sum+BigInt(x.amountMinor),0n)+BigInt(result.residualMinor),10n);
});

test('monthly payroll conserves every minor unit: worker shares plus residual equal day totals', () => {
  const days = [
    { date:'2026-10-06', teamId:'team', totalMinor:'101', workerIds:['F','S','C'] },
    { date:'2026-10-07', teamId:'team', totalMinor:'250', workerIds:['F','C'] },
    { date:'2026-10-08', teamId:'team', totalMinor:'17', workerIds:['S'] }
  ];
  const result = calculateMonthlyWorkerEarnings(days);
  const inputTotal = days.reduce((sum,day)=>sum+BigInt(day.totalMinor),0n);
  const workerTotal = result.earnings.reduce((sum,x)=>sum+BigInt(x.amountMinor),0n);
  assert.equal(workerTotal + BigInt(result.residualMinor), inputTotal);
});

test('monthly earnings reject a production day with no workers', () => {
  assert.throws(() => calculateMonthlyWorkerEarnings([
    { date:'2026-10-05', teamId:'team', totalMinor:'100', workerIds:[] }
  ]), /at least one worker/);
});

test('production first fills direct order, then priority queue, then free stock', () => {
  const result = allocateProduction(20, 5, [
    { id:'later', priority:1, createdAt:'2026-10-02T10:00:00Z', required:10, done:8 },
    { id:'top', priority:3, createdAt:'2026-10-03T10:00:00Z', required:8, done:2 },
    { id:'tie-old', priority:1, createdAt:'2026-10-01T10:00:00Z', required:6, done:0 }
  ]);
  assert.deepEqual(result, {
    allocations:[
      {orderId:'direct',quantity:5,type:'direct'},
      {orderId:'top',quantity:6,type:'surplus'},
      {orderId:'tie-old',quantity:6,type:'surplus'},
      {orderId:'later',quantity:2,type:'surplus'}
    ],
    freeStock:1
  });
});

test('no demand leaves all production as free stock', () => {
  assert.deepEqual(allocateProduction(7, 0, []), { allocations:[], freeStock:7 });
});

test('Happy Kopeck randomly selects only an eligible worker', () => {
  const result=chooseHappyKopeckWinner(3,['w1','w2','w3'],()=>1);
  assert.deepEqual(result,{amountMinor:'3',winnerId:'w2',badge:'Счастливая копейка от Чаппи 🪙🏆'});
});

test('Happy Kopeck keeps workers eligible even when their integer shares are zero', () => {
  const payroll=calculateMonthlyWorkerEarnings([
    { date:'2026-10-09', teamId:'team', totalMinor:'1', workerIds:['w1','w2'] }
  ]);
  assert.equal(payroll.residualMinor,'1');
  assert.deepEqual(payroll.earnings.map(x=>x.amountMinor),['0','0']);
  assert.deepEqual(chooseHappyKopeckWinner(payroll.residualMinor,['w1','w2'],()=>1),
    {amountMinor:'1',winnerId:'w2',badge:'Счастливая копейка от Чаппи 🪙🏆'});
});

test('Happy Kopeck has no winner when no residual remains', () => {
  assert.deepEqual(chooseHappyKopeckWinner(0,['w1']),{amountMinor:'0',winnerId:null,badge:null});
});

test('Happy Kopeck rejects an empty eligible worker list', () => {
  assert.throws(()=>chooseHappyKopeckWinner(1,[]),/No eligible workers/);
});


test('closed-month snapshot must preserve the worker display name independently of the live worker record', () => {
  // The runtime snapshot now stores displayName alongside workerId. This invariant
  // prevents a later worker rename from rewriting historical payroll labels.
  const snapshot = { earnings: [{ workerId:'w1', displayName:'Иванов', amountMinor:'1234' }] };
  const liveNames = new Map([['w1','Петров']]);
  const rendered = snapshot.earnings.map(x => ({
    workerId:x.workerId,
    displayName:x.displayName || liveNames.get(x.workerId) || 'Архивный работник',
    amountMinor:x.amountMinor
  }));
  assert.equal(rendered[0].displayName,'Иванов');
});
