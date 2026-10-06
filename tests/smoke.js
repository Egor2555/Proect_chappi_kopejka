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
  await must('/api/auth/recovery/complete',{method:'POST',body:{code:'abc',newPin:'1234'}},400);
  await must('/api/auth/recovery/complete',{method:'POST',body:{code:'12345678',newPin:'12'}},400);
  const adminLogin=await must('/api/auth/login',{method:'POST',body:{profile:'brigadier',pin:String(2500+5)}});
  const admin=adminLogin.token;
  const brigadierLogin=await must('/api/auth/login',{method:'POST',body:{profile:'brigadier',pin:'1111'}});
  const brigadier=brigadierLogin.token;
  await must('/api/auth/recovery/request',{method:'POST',body:{}},409);
  await must('/api/dashboard',{token:admin});
  const products=await must('/api/products',{token:admin});
  assert.ok(products.length >= 10);
  const teams=await must('/api/teams',{token:admin});
  assert.ok(teams.length);
  const product=products.find(p=>p.length_mm===1500);
  const product2=products.find(p=>p.length_mm===2000);
  const product25=products.find(p=>p.length_mm===2500);
  const team=teams[0];
  const today=new Date().toISOString().slice(0,10);
  const d1=new Date(today+'T00:00:00Z'); d1.setUTCDate(d1.getUTCDate()-2);
  const d2=new Date(today+'T00:00:00Z'); d2.setUTCDate(d2.getUTCDate()-1);
  const day1=d1.toISOString().slice(0,10), day2=d2.toISOString().slice(0,10);
  const month=today.slice(0,7)+'-01';

  const worker=await must('/api/workers',{token:admin,method:'POST',body:{displayName:'CI Worker F'}},201);
  const workerS=await must('/api/workers',{token:admin,method:'POST',body:{displayName:'CI Worker S'}},201);
  const workerC=await must('/api/workers',{token:admin,method:'POST',body:{displayName:'CI Worker C'}},201);
  for (const w of [worker,workerS,workerC]) await must('/api/team-memberships',{token:admin,method:'POST',body:{workerId:w.id,teamId:team.id,validFrom:month}},201);
  await must('/api/attendance',{token:brigadier,method:'POST',body:{workDate:day1,teamId:team.id,workerIds:[workerS.id,workerC.id]}});
  await must('/api/attendance',{token:brigadier,method:'POST',body:{workDate:day2,teamId:team.id,workerIds:[workerC.id]}});
  await must('/api/attendance',{token:brigadier,method:'POST',body:{workDate:today,teamId:team.id,workerIds:[worker.id,workerS.id,workerC.id]}});
  const attendance=await must('/api/attendance?date='+today,{token:brigadier});
  assert.equal(attendance.length,3);

  const orderA=await must('/api/orders',{token:admin,method:'POST',body:{orderNumber:'CI-A',title:'CI direct order',priority:1,items:[{productId:product.id,requiredQty:2}]}},201);
  const orderB=await must('/api/orders',{token:admin,method:'POST',body:{orderNumber:'CI-B',title:'CI surplus order',priority:2,items:[{productId:product.id,requiredQty:1}]}},201);

  await must('/api/daily-reports',{token:brigadier,method:'POST',body:{workDate:day1,items:[
    {productId:product.id,quantity:3},
    {productId:product2.id,quantity:150},
    {productId:product25.id,quantity:100}
  ],workerIds:[workerS.id,workerC.id]}},201);
  const orders=await must('/api/orders',{token:admin});
  assert.equal(orders.find(o=>o.id===orderA.id).status,'completed');
  assert.equal(orders.find(o=>o.id===orderB.id).status,'completed');
  assert.equal(orders.find(o=>o.id===orderB.id).items[0].done,1);

  const stock=await must('/api/stock',{token:admin});
  assert.equal(stock.find(x=>x.id===product.id).quantity,0);

  await must('/api/shipments',{token:brigadier,method:'POST',body:{shipmentNumber:'CI-SHIP-1',orderId:orderA.id,recipient:'CI recipient',items:[{productId:product.id,quantity:2}]}},201);
  const stockAfter=await must('/api/stock',{token:admin});
  assert.equal(stockAfter.find(x=>x.id===product.id).quantity,0);
  const shipments=await must('/api/shipments',{token:brigadier});
  assert.equal(shipments.length,1);
  assert.equal(String(shipments[0].payroll_month).slice(0,10),month);
  await must('/api/payments',{token:admin,method:'POST',body:{shipmentId:shipments[0].id,amountMinor:250,note:'CI credited'}},201);
  const payments=await must('/api/payments',{token:admin});
  assert.equal(payments.length,1);

  await must('/api/daily-reports',{token:brigadier,method:'POST',body:{workDate:today,items:[
    {productId:product2.id,quantity:150},
    {productId:product25.id,quantity:50}
  ],workerIds:[worker.id,workerS.id,workerC.id]}},201);
  const productionHistory=await must('/api/production?date='+day1,{token:admin});
  assert.equal(productionHistory.length,3);
  await must('/api/month/close',{token:brigadier,method:'POST',body:{month:today.slice(0,7)}},201);
  const beforeRates=await must('/api/reports/monthly?month='+today.slice(0,7),{token:admin});
  assert.deepEqual(beforeRates.missingRates.map(x=>({length_m:String(x.length_m),section_width_mm:Number(x.section_width_mm),section_height_mm:Number(x.section_height_mm)})),[{length_m:'1.5',section_width_mm:60,section_height_mm:40}]);
  assert.equal(beforeRates.total.quantity,2);
  const rateEligibility=await request('/api/rates',{token:admin,method:'POST',body:{productId:product.id,periodMonth:month,amountMinor:125}});
  assert.equal(rateEligibility.status,201,JSON.stringify(rateEligibility.data));
  await must('/api/rates',{token:admin,method:'POST',body:{productId:product2.id,periodMonth:month,amountMinor:1000}},201);
  await must('/api/rates',{token:admin,method:'POST',body:{productId:product25.id,periodMonth:month,amountMinor:1500}},201);
  const report=await must('/api/reports/monthly?month='+today.slice(0,7),{token:admin});
  assert.equal(report.total.quantity,2);
  assert.equal(report.total.totalMinor,'250');

  await must('/api/fund',{token:admin,method:'POST',body:{entryDate:today,entryType:'income',amountMinor:1000,note:'CI fund'}},201);
  const fund=await must('/api/fund',{token:admin});
  assert.equal(fund.summary.balance_minor,'1000');

  await must('/api/orders/'+orderA.id+'/archive',{token:admin,method:'PATCH',body:{}});
  await must('/api/orders/'+orderB.id+'/archive',{token:admin,method:'PATCH',body:{}});
  await must('/api/reports/close-month',{token:admin,method:'POST',body:{month:today.slice(0,7)}},201);
  const duplicateClose=await request('/api/reports/close-month',{token:admin,method:'POST',body:{month:today.slice(0,7)}});
  assert.equal(duplicateClose.status,400);
  const closedReport=await must('/api/reports/monthly?month='+today.slice(0,7),{token:admin});
  assert.equal(closedReport.earnings.length,2);
  const earned=Object.fromEntries(closedReport.earnings.map(x=>[x.worker_id,x.amount_minor]));
  assert.deepEqual(Object.values(earned).map(Number).sort((a,b)=>a-b),[125,125]);
  assert.equal(Object.values(earned).reduce((sum,x)=>sum+Number(x),0),250);
  assert.equal(closedReport.total.totalMinor,'250');
  const closedProduction=await request('/api/daily-reports',{token:brigadier,method:'POST',body:{workDate:today,items:[{productId:product.id,quantity:1}],workerIds:[worker.id,workerS.id,workerC.id]}});
  assert.equal(closedProduction.status,403);

  await must('/api/fund',{token:brigadierLogin.token});
  const brigadierCannotCreateOrder=await request('/api/orders',{token:brigadierLogin.token,method:'POST',body:{orderNumber:'CI-FORBIDDEN',title:'Should be denied',items:[{productId:product.id,requiredQty:1}]}});
  assert.equal(brigadierCannotCreateOrder.status,403);
  const brigadierCannotWriteFund=await request('/api/fund',{token:brigadierLogin.token,method:'POST',body:{entryDate:today,entryType:'income',amountMinor:1,note:'forbidden'}});
  assert.equal(brigadierCannotWriteFund.status,403);
  const brigadierCannotWriteRates=await request('/api/rates',{token:brigadierLogin.token,method:'POST',body:{productId:product.id,periodMonth:month,amountMinor:1}});
  assert.equal(brigadierCannotWriteRates.status,403);

  const workerLogin=await must('/api/auth/login',{method:'POST',body:{profile:'worker'}});
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
  assert.ok(backup.tables.monthly_worker_earnings.length===2);
  assert.equal(JSON.stringify(backup).includes('password_hash'),false);

  console.log('SMOKE TEST PASSED: auth, roles, rates, orders, surplus, stock, shipment, payment, report, fund, close, archive and backup');
})().catch(error=>{console.error(error);process.exit(1)});
