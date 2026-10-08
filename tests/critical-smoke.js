const assert = require('node:assert/strict');
const { Client } = require('pg');

const base = process.env.BASE_URL || 'http://127.0.0.1:8080';

async function request(path, { token, method='GET', body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(body ? {'Content-Type':'application/json'} : {}),
      ...(token ? {Authorization:'Bearer '+token} : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}
  return { status:response.status, data };
}
async function must(path, options, expected=200) {
  const r=await request(path,options);
  assert.equal(r.status,expected,path+' returned '+r.status+': '+JSON.stringify(r.data));
  return r.data;
}
function dateShift(isoDate, days) {
  const d=new Date(isoDate+'T00:00:00Z');
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}

(async()=>{
  await must('/api/health');

  const adminLogin=await must('/api/auth/login',{method:'POST',body:{profile:'brigadier',pin:'2505'}});
  const admin=adminLogin.token;
  const brigadierLogin=await must('/api/auth/login',{method:'POST',body:{profile:'brigadier',pin:'1111'}});
  const brigadier=brigadierLogin.token;

  const products=await must('/api/products',{token:admin});
  const teams=await must('/api/teams',{token:admin});
  const product2=products.find(p=>Number(p.length_mm)===2000);
  const product25=products.find(p=>Number(p.length_mm)===2500);
  assert.ok(product2 && product25,'seeded test products are missing');
  const team=teams[0];

  const today=new Date().toISOString().slice(0,10);
  const currentMonth=today.slice(0,7)+'-01';
  const prevMonthFirst=dateShift(currentMonth,-1);
  const prevMonthLast=dateShift(currentMonth,-1);

  const worker1=await must('/api/workers',{token:admin,method:'POST',body:{displayName:'Critical Worker A'}},201);
  const worker2=await must('/api/workers',{token:admin,method:'POST',body:{displayName:'Critical Worker B'}},201);
  const workerB=await must('/api/workers',{token:admin,method:'POST',body:{displayName:'Critical Brigadier'}},201);
  await must('/api/workers/'+workerB.id+'/brigadier',{token:admin,method:'PATCH',body:{}});

  const db=new Client({connectionString:process.env.DATABASE_URL});
  await db.connect();
  await db.query(
    "INSERT INTO worker_role_history(worker_id,role,valid_from) VALUES($1,'brigadier',$2::date) ON CONFLICT DO NOTHING",
    [workerB.id,prevMonthLast]
  );
  await db.end();

  for (const w of [worker1,worker2]) {
    await must('/api/team-memberships',{
      token:admin,method:'POST',
      body:{workerId:w.id,teamId:team.id,validFrom:prevMonthLast}
    },201);
  }

  // 1) Daily-report edit must return released reserved production to free stock.
  const editDay=dateShift(today,-2);
  const editOrder=await must('/api/orders',{
    token:admin,method:'POST',
    body:{orderNumber:'CRIT-EDIT',title:'Critical daily-report edit',priority:9,
      items:[{productId:product2.id,requiredQty:150}]}
  },201);

  await must('/api/daily-reports',{
    token:brigadier,method:'POST',
    body:{workDate:editDay,items:[{productId:product2.id,quantity:150}],workerIds:[worker1.id,worker2.id]}
  },201);

  let options=await must('/api/shipment-options',{token:admin});
  let orderOption=options.orderItems.find(x=>String(x.productId)===String(product2.id));
  let stockOption=options.stockItems.find(x=>String(x.product_id)===String(product2.id));
  assert.equal(Number(orderOption.available),150);
  assert.equal(stockOption,undefined);

  // Change the same report twice; each edit must reverse the previous reservation
  // exactly once and reallocate only the new quantity.
  await must('/api/daily-reports',{
    token:brigadier,method:'POST',
    body:{workDate:editDay,items:[{productId:product2.id,quantity:100}],workerIds:[worker1.id,worker2.id]}
  },201);
  options=await must('/api/shipment-options',{token:admin});
  orderOption=options.orderItems.find(x=>String(x.productId)===String(product2.id));
  stockOption=options.stockItems.find(x=>String(x.product_id)===String(product2.id));
  assert.equal(Number(orderOption.available),100);
  assert.equal(Number(stockOption.available),50);

  await must('/api/daily-reports',{
    token:brigadier,method:'POST',
    body:{workDate:editDay,items:[{productId:product2.id,quantity:120}],workerIds:[worker1.id,worker2.id]}
  },201);
  options=await must('/api/shipment-options',{token:admin});
  orderOption=options.orderItems.find(x=>String(x.productId)===String(product2.id));
  stockOption=options.stockItems.find(x=>String(x.product_id)===String(product2.id));
  assert.equal(Number(orderOption.available),120);
  assert.equal(Number(stockOption.available),30);

  const physicalStock=await must('/api/stock',{token:admin});
  assert.equal(Number(physicalStock.find(x=>String(x.id)===String(product2.id)).quantity),120);

  // 2) Shipment must consume order stock first, then warehouse stock, and never reuse a batch.
  await must('/api/shipments',{
    token:brigadier,method:'POST',
    body:{items:[{productId:product2.id,quantity:120}]}
  },201);
  options=await must('/api/shipment-options',{token:admin});
  assert.equal(options.orderItems.some(x=>String(x.productId)===String(product2.id)),false);
  assert.equal(options.stockItems.some(x=>String(x.product_id)===String(product2.id)),false);

  const overShip=await request('/api/shipments',{
    token:brigadier,method:'POST',
    body:{items:[{productId:product2.id,quantity:1}]}
  });
  assert.equal(overShip.status,400);
  assert.match(String(overShip.data.error||''),/Недостаточно|остат|доступ/i);

  // 3) Production in the previous calendar month, shipped in the current month,
  // must survive final payroll closing of the current month.
  const crossOrder=await must('/api/orders',{
    token:admin,method:'POST',
    body:{orderNumber:'CRIT-CROSS',title:'Critical cross-month order',priority:8,
      items:[{productId:product25.id,requiredQty:5}]}
  },201);

  await must('/api/daily-reports',{
    token:brigadier,method:'POST',
    body:{workDate:prevMonthLast,items:[{productId:product25.id,quantity:5}],workerIds:[worker1.id,worker2.id]}
  },201);

  const currentShipment=await must('/api/shipments',{
    token:brigadier,method:'POST',
    body:{items:[{productId:product25.id,quantity:5}]}
  },201);
  assert.equal(String(currentShipment.payroll_month).slice(0,10),currentMonth);

  await must('/api/rates',{
    token:admin,method:'POST',
    body:{productId:product2.id,periodMonth:currentMonth,amountMinor:1000}
  },201);
  await must('/api/rates',{
    token:admin,method:'POST',
    body:{productId:product25.id,periodMonth:currentMonth,amountMinor:1500}
  },201);

  await must('/api/month/close',{
    token:brigadier,method:'POST',
    body:{month:today.slice(0,7)}
  },201);

  const beforeFinal=await must('/api/reports/monthly?month='+today.slice(0,7),{token:admin});
  assert.equal(Number(beforeFinal.total.quantity),125);
  assert.equal(String(beforeFinal.total.totalMinor),'127500');

  const finalClose=await request('/api/reports/close-month',{
    token:admin,method:'POST',body:{month:today.slice(0,7)}
  });
  assert.equal(finalClose.status,201,JSON.stringify(finalClose.data));
  const closed=await must('/api/reports/monthly?month='+today.slice(0,7),{token:admin});
  assert.equal(closed.closed,true);
  assert.equal(String(closed.total.totalMinor),'127500');

  // 4) Backup restore must leave every BIGSERIAL sequence usable. We simulate
  // a restore into a database whose sequence was reset, because explicit backup
  // IDs do not advance PostgreSQL sequences. The production restore currently
  // repairs audit_log/login_log; worker_role_history is also BIGSERIAL.
  const backup=await must('/api/admin/export',{token:admin});
  assert.ok(backup.tables.worker_role_history.length>0);
  const maxRoleId=Math.max(...backup.tables.worker_role_history.map(x=>Number(x.id)));
  assert.ok(maxRoleId>0);

  const db2=new Client({connectionString:process.env.DATABASE_URL});
  await db2.connect();
  await db2.query("SELECT setval(pg_get_serial_sequence('worker_role_history','id'),1,true)");
  await db2.end();

  await must('/api/admin/restore',{
    token:admin,method:'POST',
    body:{confirm:'RESTORE BUSINESS DATA',backup}
  },201);

  const roleInsertProbe=await request('/api/workers/'+workerB.id+'/brigadier',{
    token:admin,method:'PATCH',body:{}
  });
  assert.notEqual(roleInsertProbe.status,500);
  // The route above removes the current brigadier rather than inserting; assign
  // another worker so the BIGSERIAL path actually executes.
  const newBrig=await must('/api/workers/'+worker1.id+'/brigadier',{
    token:admin,method:'PATCH',body:{}
  },200);
  assert.equal(newBrig.is_brigadier,true);

  console.log('CRITICAL E2E PASSED: daily-report edit/re-edit stock release, shipment anti-double-use, cross-month payroll close, backup restore sequence probe');
})().catch(error=>{console.error(error);process.exit(1)});
