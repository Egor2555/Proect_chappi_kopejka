const assert = require('node:assert/strict');

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';
async function request(path, { token, method='GET', body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:'Bearer '+token} : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { status:response.status, data };
}
async function must(path, options, expected=200) {
  const r=await request(path,options);
  assert.equal(r.status,expected, path+' returned '+r.status+': '+JSON.stringify(r.data));
  return r.data;
}
(async()=>{
  await must('/api/health');
  const adminLogin=await must('/api/auth/login',{method:'POST',body:{username:process.env.INITIAL_ADMIN_USERNAME||'admin',password:process.env.INITIAL_ADMIN_PASSWORD}});
  const admin=adminLogin.token;
  await must('/api/dashboard',{token:admin});
  const products=await must('/api/products',{token:admin});
  assert.equal(products.length,6);
  const teams=await must('/api/teams',{token:admin});
  assert.ok(teams.length);
  const product=products.find(p=>p.length_mm===1500);
  const team=teams[0];
  const today=new Date().toISOString().slice(0,10);
  const month=today.slice(0,7)+'-01';

  const worker=await must('/api/workers',{token:admin,method:'POST',body:{displayName:'CI Test Worker'}},201);
  await must('/api/team-memberships',{token:admin,method:'POST',body:{workerId:worker.id,teamId:team.id,validFrom:today}},201);
  await must('/api/users',{token:admin,method:'POST',body:{username:'ci-worker',password:'TestWorkerPassword123',role:'worker',workerId:worker.id}},201);
  await must('/api/attendance',{token:admin,method:'POST',body:{workDate:today,teamId:team.id,workerIds:[worker.id]}});
  const attendance=await must('/api/attendance?date='+today,{token:admin});
  assert.equal(attendance.length,1);

  const orderA=await must('/api/orders',{token:admin,method:'POST',body:{orderNumber:'CI-A',title:'CI direct order',priority:1,items:[{productId:product.id,requiredQty:2}]}},201);
  const orderB=await must('/api/orders',{token:admin,method:'POST',body:{orderNumber:'CI-B',title:'CI surplus order',priority:2,items:[{productId:product.id,requiredQty:1}]}},201);

  await must('/api/production',{token:admin,method:'POST',body:{workDate:today,teamId:team.id,productId:product.id,orderId:orderA.id,quantity:3,note:'CI end-to-end'}},201);
  const orders=await must('/api/orders',{token:admin});
  assert.equal(orders.find(o=>o.id===orderA.id).status,'completed');
  assert.equal(orders.find(o=>o.id===orderB.id).status,'completed');
  assert.equal(orders.find(o=>o.id===orderB.id).items[0].done,1);

  const stock=await must('/api/stock',{token:admin});
  assert.equal(stock.find(x=>x.id===product.id).quantity,3);

  await must('/api/shipments',{token:admin,method:'POST',body:{shipmentNumber:'CI-SHIP-1',orderId:orderA.id,recipient:'CI recipient',items:[{productId:product.id,quantity:2}]}},201);
  const stockAfter=await must('/api/stock',{token:admin});
  assert.equal(stockAfter.find(x=>x.id===product.id).quantity,1);
  const shipments=await must('/api/shipments',{token:admin});
  assert.equal(shipments.length,1);
  await must('/api/payments',{token:admin,method:'POST',body:{shipmentId:shipments[0].id,amountMinor:250,note:'CI credited'}},201);
  const payments=await must('/api/payments',{token:admin});
  assert.equal(payments.length,1);

  const productionHistory=await must('/api/production?date='+today,{token:admin});
  assert.equal(productionHistory.length,1);
  const beforeRates=await must('/api/reports/monthly?month='+today.slice(0,7),{token:admin});
  assert.deepEqual(beforeRates.missingRates,[1500]);
  assert.equal(beforeRates.total.totalMinor,'0');
  await must('/api/rates',{token:admin,method:'POST',body:{productId:product.id,periodMonth:month,amountMinor:125}},201);
  const report=await must('/api/reports/monthly?month='+today.slice(0,7),{token:admin});
  assert.equal(report.total.quantity,3);
  assert.equal(report.total.totalMinor,'375');

  await must('/api/fund',{token:admin,method:'POST',body:{entryDate:today,entryType:'income',amountMinor:1000,note:'CI fund'}},201);
  const fund=await must('/api/fund',{token:admin});
  assert.equal(fund.summary.balance_minor,'1000');

  await must('/api/orders/'+orderA.id+'/archive',{token:admin,method:'PATCH',body:{}});
  await must('/api/orders/'+orderB.id+'/archive',{token:admin,method:'PATCH',body:{}});
  await must('/api/reports/close-month',{token:admin,method:'POST',body:{month:today.slice(0,7)}},201);
  const closedReport=await must('/api/reports/monthly?month='+today.slice(0,7),{token:admin});
  assert.equal(closedReport.earnings.length,1);
  assert.equal(closedReport.earnings[0].amount_minor,'375');
  const closedProduction=await request('/api/production',{token:admin,method:'POST',body:{workDate:today,teamId:team.id,productId:product.id,quantity:1}});
  assert.equal(closedProduction.status,400);

  const workerLogin=await must('/api/auth/login',{method:'POST',body:{username:'ci-worker',password:'TestWorkerPassword123'}});
  const denied=await request('/api/admin/login-log',{token:workerLogin.token});
  assert.equal(denied.status,403);
  const deniedProduction=await request('/api/production?date='+today,{token:workerLogin.token});
  assert.equal(deniedProduction.status,403);
  const deniedOldReport=await request('/api/reports/monthly?month=2020-01',{token:workerLogin.token});
  assert.equal(deniedOldReport.status,403);
  await must('/api/reports/monthly?month='+today.slice(0,7),{token:workerLogin.token});
  await must('/api/archive/months',{token:workerLogin.token});

  await must('/api/admin/mode-event',{token:admin,method:'POST',body:{}},201);
  const log=await must('/api/admin/login-log',{token:admin});
  assert.ok(log.length>=2);
  const archive=await must('/api/archive/months',{token:admin});
  assert.ok(archive.length>=1);
  const backup=await must('/api/admin/export',{token:admin});
  assert.ok(backup.tables.workers.length>=1);
  assert.ok(backup.tables.login_log.length>=2);
  assert.equal(JSON.stringify(backup).includes('password_hash'),false);

  console.log('SMOKE TEST PASSED: auth, roles, rates, orders, surplus, stock, shipment, payment, report, fund, close, archive and backup');
})().catch(error=>{console.error(error);process.exit(1)});
