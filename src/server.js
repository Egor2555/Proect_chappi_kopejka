const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET;
if (!process.env.DATABASE_URL || !JWT_SECRET) {
  console.error('DATABASE_URL and JWT_SECRET are required.');
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../public')));

async function audit(client, actor, action, type, id, beforeData, afterData, reason) {
  await client.query(
    'INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [actor, action, type, id || null, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null, reason || null]
  );
}
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    if (!token) throw new Error('missing');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ error: 'Требуется вход в систему' }); }
}
function roles(...allowed) {
  return (req, res, next) => allowed.includes(req.user.role)
    ? next() : res.status(403).json({ error: 'Недостаточно прав' });
}
async function tx(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}
const asyncRoute = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);

app.get('/api/health', asyncRoute(async (_req,res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true, service: 'Chappi Edition' });
}));

app.post('/api/auth/login', asyncRoute(async (req,res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const found = await pool.query('SELECT id,username,password_hash,role,worker_id,active FROM users WHERE username=$1', [username]);
  const user = found.rows[0];
  const ok = !!user && user.active && await bcrypt.compare(password, user.password_hash);
  await pool.query('INSERT INTO login_log(user_id,username_attempt,success) VALUES($1,$2,$3)', [user?.id || null, username || '(empty)', ok]);
  if (!ok) return res.status(401).json({ error: 'Неверный логин или пароль' });
  const token = jwt.sign({ sub:user.id, username:user.username, role:user.role, workerId:user.worker_id }, JWT_SECRET, { expiresIn:'12h' });
  res.json({ token, user:{ id:user.id, username:user.username, role:user.role, workerId:user.worker_id } });
}));

app.get('/api/me', auth, (req,res) => res.json({ user:req.user }));

app.get('/api/dashboard', auth, asyncRoute(async (req,res) => {
  const [today, stock, queue] = await Promise.all([
    pool.query(`SELECT p.length_mm, SUM(e.quantity)::int AS quantity
      FROM production_entries e JOIN products p ON p.id=e.product_id
      WHERE e.work_date=CURRENT_DATE AND e.voided_at IS NULL GROUP BY p.length_mm ORDER BY p.length_mm`),
    pool.query(`SELECT p.id,p.length_mm,COALESCE(SUM(m.quantity_delta),0)::int AS quantity
      FROM products p LEFT JOIN inventory_movements m ON m.product_id=p.id
      WHERE p.active=true GROUP BY p.id ORDER BY p.length_mm`),
    pool.query(`SELECT o.id,o.order_number,o.title,o.priority,o.status,o.created_at,
      COALESCE(json_agg(json_build_object('length_mm',p.length_mm,'required',i.required_qty,
        'done',COALESCE(done.qty,0),'remaining',GREATEST(i.required_qty-COALESCE(done.qty,0),0))
      ) ORDER BY p.length_mm) AS items
      FROM orders o JOIN order_items i ON i.order_id=o.id JOIN products p ON p.id=i.product_id
      LEFT JOIN LATERAL (SELECT SUM(quantity)::int qty FROM production_entries e
        WHERE e.order_id=o.id AND e.product_id=i.product_id AND e.voided_at IS NULL) done ON true
      WHERE o.status IN ('queued','active') GROUP BY o.id
      ORDER BY o.priority DESC,o.created_at ASC`)
  ]);
  res.json({ today:today.rows, stock:stock.rows, orders:queue.rows });
}));

app.get('/api/products', auth, asyncRoute(async (_req,res) => {
  const r=await pool.query('SELECT * FROM products ORDER BY length_mm');
  res.json(r.rows);
}));
app.post('/api/products', auth, roles('admin'), asyncRoute(async (req,res) => {
  const {code,lengthMm,sectionWidthMm=60,sectionHeightMm=40}=req.body;
  if (!code || !Number.isInteger(Number(lengthMm)) || Number(lengthMm)<=0) return res.status(400).json({error:'Проверьте код и длину'});
  const r=await pool.query('INSERT INTO products(code,length_mm,section_width_mm,section_height_mm) VALUES($1,$2,$3,$4) RETURNING *',
    [code,Number(lengthMm),Number(sectionWidthMm),Number(sectionHeightMm)]);
  await pool.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,after_data) VALUES($1,'create','product',$2,$3)",[req.user.sub,r.rows[0].id,JSON.stringify(r.rows[0])]);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/workers', auth, asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT w.id,w.display_name,w.active,t.name AS team_name
    FROM workers w LEFT JOIN LATERAL (SELECT tm.name FROM team_memberships m JOIN teams tm ON tm.id=m.team_id
      WHERE m.worker_id=w.id AND m.valid_to IS NULL ORDER BY m.valid_from DESC LIMIT 1) t ON true
    ORDER BY w.display_name`);
  res.json(r.rows);
}));
app.post('/api/workers', auth, roles('admin'), asyncRoute(async (req,res) => {
  const name=String(req.body.displayName||'').trim();
  if (!name) return res.status(400).json({error:'Укажите имя работника'});
  const r=await pool.query('INSERT INTO workers(display_name) VALUES($1) RETURNING *',[name]);
  await pool.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,after_data) VALUES($1,'create','worker',$2,$3)",[req.user.sub,r.rows[0].id,JSON.stringify(r.rows[0])]);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/teams', auth, asyncRoute(async (_req,res) => res.json((await pool.query('SELECT * FROM teams WHERE active=true ORDER BY name')).rows)));
app.post('/api/teams', auth, roles('admin'), asyncRoute(async (req,res) => {
  const name=String(req.body.name||'').trim(); if(!name) return res.status(400).json({error:'Укажите название бригады'});
  const r=await pool.query('INSERT INTO teams(name) VALUES($1) RETURNING *',[name]); res.status(201).json(r.rows[0]);
}));

app.post('/api/attendance', auth, roles('admin','brigadier'), asyncRoute(async (req,res) => {
  const {workDate,teamId,workerIds=[]}=req.body;
  if(!workDate||!teamId||!Array.isArray(workerIds)) return res.status(400).json({error:'Недостаточно данных'});
  const created=await tx(async c=>{
    await c.query('DELETE FROM attendance_entries WHERE work_date=$1 AND team_id=$2',[workDate,teamId]);
    const rows=[];
    for(const workerId of workerIds){
      const r=await c.query('INSERT INTO attendance_entries(work_date,team_id,worker_id,created_by) VALUES($1,$2,$3,$4) RETURNING *',[workDate,teamId,workerId,req.user.sub]);
      rows.push(r.rows[0]);
    }
    await audit(c,req.user.sub,'replace_daily_attendance','attendance',teamId,null,{workDate,workerIds});
    return rows;
  });
  res.json(created);
}));

app.get('/api/rates', auth, roles('admin'), asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT r.*,p.length_mm FROM rates r JOIN products p ON p.id=r.product_id ORDER BY r.period_month DESC,p.length_mm`);
  res.json(r.rows);
}));

app.post('/api/rates', auth, roles('admin'), asyncRoute(async (req,res) => {
  const {productId,periodMonth,amountMinor}=req.body;
  if(!productId||!/^\d{4}-\d{2}-01$/.test(periodMonth||'')||!Number.isSafeInteger(Number(amountMinor))||Number(amountMinor)<0)
    return res.status(400).json({error:'Проверьте изделие, месяц и сумму в копейках'});
  const r=await pool.query(`INSERT INTO rates(product_id,period_month,amount_minor,created_by)
    VALUES($1,$2,$3,$4) ON CONFLICT(product_id,period_month) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,created_by=EXCLUDED.created_by
    RETURNING *`,[productId,periodMonth,Number(amountMinor),req.user.sub]);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/orders', auth, asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT o.*,COALESCE(json_agg(json_build_object('productId',i.product_id,'lengthMm',p.length_mm,'required',i.required_qty,
    'done',COALESCE(d.qty,0),'remaining',GREATEST(i.required_qty-COALESCE(d.qty,0),0))) ORDER BY p.length_mm) items
    FROM orders o JOIN order_items i ON i.order_id=o.id JOIN products p ON p.id=i.product_id
    LEFT JOIN LATERAL(SELECT SUM(a.quantity)::int qty FROM production_allocations a WHERE a.order_id=o.id AND a.product_id=i.product_id)d ON true
    GROUP BY o.id ORDER BY o.priority DESC,o.created_at ASC`);
  res.json(r.rows);
}));
app.post('/api/orders', auth, roles('admin'), asyncRoute(async (req,res) => {
  const {orderNumber,title,priority=0,items=[]}=req.body;
  if(!orderNumber||!title||!Array.isArray(items)||!items.length) return res.status(400).json({error:'Заполните заказ и его позиции'});
  const order=await tx(async c=>{
    const o=(await c.query('INSERT INTO orders(order_number,title,priority,created_by) VALUES($1,$2,$3,$4) RETURNING *',[orderNumber,title,Number(priority)||0,req.user.sub])).rows[0];
    for(const item of items){
      if(!Number.isInteger(Number(item.requiredQty))||Number(item.requiredQty)<=0) throw new Error('Количество в заказе должно быть положительным целым числом');
      await c.query('INSERT INTO order_items(order_id,product_id,required_qty) VALUES($1,$2,$3)',[o.id,item.productId,Number(item.requiredQty)]);
    }
    await audit(c,req.user.sub,'create','order',o.id,null,o);
    return o;
  });
  res.status(201).json(order);
}));

app.post('/api/production', auth, roles('admin','brigadier'), asyncRoute(async (req,res) => {
  const {workDate,teamId,productId,orderId=null,quantity,note=''}=req.body;
  if(!workDate||!teamId||!productId||!Number.isInteger(Number(quantity))||Number(quantity)<=0)
    return res.status(400).json({error:'Проверьте дату, бригаду, изделие и количество'});
  const result=await tx(async c=>{
    const month=String(workDate).slice(0,7)+'-01';
    const rate=(await c.query('SELECT * FROM rates WHERE product_id=$1 AND period_month=$2',[productId,month])).rows[0];
    if(!rate) throw new Error('На этот месяц ещё не задана расценка для выбранной длины');
    const total=BigInt(rate.amount_minor)*BigInt(quantity);
    const p=(await c.query(`INSERT INTO production_entries(work_date,team_id,product_id,order_id,quantity,rate_id,rate_snapshot_minor,total_minor,note,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [workDate,teamId,productId,orderId,Number(quantity),rate.id,rate.amount_minor,total.toString(),note,req.user.sub])).rows[0];
    let remaining=Number(quantity);
    if(orderId){
      const requested=(await c.query('SELECT required_qty FROM order_items WHERE order_id=$1 AND product_id=$2',[orderId,productId])).rows[0];
      const done=(await c.query('SELECT COALESCE(SUM(quantity),0)::int qty FROM production_allocations WHERE order_id=$1 AND product_id=$2',[orderId,productId])).rows[0].qty;
      if(!requested) throw new Error('В заказе нет выбранного типоразмера');
      const needBefore=Math.max(0,Number(requested.required_qty)-Number(done));\n      const direct=Math.min(Number(quantity),needBefore);\n      if(direct>0) await c.query(\`INSERT INTO production_allocations(production_entry_id,order_id,product_id,quantity,allocation_type) VALUES($1,$2,$3,$4,'direct')\`,[p.id,orderId,productId,direct]);\n      remaining=Number(quantity)-direct;
    }
    const assigned=Math.max(0,Number(quantity)-remaining);
    if(assigned>0) await c.query(`INSERT INTO inventory_movements(product_id,movement_type,quantity_delta,production_entry_id,order_id,created_by)
      VALUES($1,'production_in',$2,$3,$4,$5)`,[productId,assigned,p.id,orderId,req.user.sub]);
    if(remaining>0){
      const candidates=(await c.query(`SELECT o.id,i.required_qty,
        COALESCE((SELECT SUM(a.quantity)::int FROM production_allocations a WHERE a.order_id=o.id AND a.product_id=i.product_id),0) done
        FROM orders o JOIN order_items i ON i.order_id=o.id
        WHERE o.id<>COALESCE($1::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
          AND o.status IN ('queued','active') AND i.product_id=$2
        ORDER BY o.priority DESC,o.created_at ASC FOR UPDATE OF o`,[orderId,productId])).rows;
      for(const candidate of candidates){
        const need=Math.max(0,Number(candidate.required_qty)-Number(candidate.done));
        if(!need) continue;
        const move=Math.min(need,remaining);
        await c.query(`INSERT INTO production_allocations(production_entry_id,order_id,product_id,quantity,allocation_type) VALUES($1,$2,$3,$4,'surplus')`,
          [p.id,candidate.id,productId,move]);
        await c.query(`INSERT INTO inventory_movements(product_id,movement_type,quantity_delta,production_entry_id,order_id,created_by,note)
          VALUES($1,'surplus_transfer',$2,$3,$4,$5,'Автоматическое распределение излишка по очереди')`,
          [productId,move,p.id,candidate.id,req.user.sub]);
        remaining-=move;
        const candidateMissing=(await c.query(`SELECT COUNT(*)::int n FROM order_items i WHERE i.order_id=$1 AND i.required_qty >
          COALESCE((SELECT SUM(a.quantity)::int FROM production_allocations a WHERE a.order_id=i.order_id AND a.product_id=i.product_id),0)`,[candidate.id])).rows[0].n;
        if(candidateMissing===0) await c.query("UPDATE orders SET status='completed',completed_at=now() WHERE id=$1",[candidate.id]);
        else await c.query("UPDATE orders SET status='active' WHERE id=$1 AND status='queued'",[candidate.id]);
        if(!remaining) break;
      }
    }
    if(remaining>0) await c.query(`INSERT INTO inventory_movements(product_id,movement_type,quantity_delta,production_entry_id,created_by,note)
      VALUES($1,'production_in',$2,$3,$4,'Излишек на свободный склад')`,[productId,remaining,p.id,req.user.sub]);
    if(orderId){
      const missing=(await c.query(`SELECT COUNT(*)::int n FROM order_items i WHERE i.order_id=$1 AND i.required_qty >
        COALESCE((SELECT SUM(a.quantity)::int FROM production_allocations a WHERE a.order_id=i.order_id AND a.product_id=i.product_id),0)`,[orderId])).rows[0].n;
      if(missing===0) {
        await c.query("UPDATE orders SET status='completed',completed_at=now() WHERE id=$1",[orderId]);
        await c.query(`UPDATE orders SET status='active' WHERE id=(
          SELECT id FROM orders WHERE status='queued' ORDER BY priority DESC,created_at ASC LIMIT 1
        )`);
      } else await c.query("UPDATE orders SET status='active' WHERE id=$1 AND status='queued'",[orderId]);
    }
    await audit(c,req.user.sub,'create','production_entry',p.id,null,p);
    return p;
  });
  res.status(201).json(result);
}));

app.get('/api/stock', auth, asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT p.id,p.code,p.length_mm,COALESCE(SUM(m.quantity_delta),0)::int quantity
    FROM products p LEFT JOIN inventory_movements m ON m.product_id=p.id
    GROUP BY p.id ORDER BY p.length_mm`);
  res.json(r.rows);
}));

app.post('/api/shipments', auth, roles('admin','brigadier'), asyncRoute(async (req,res) => {
  const {shipmentNumber,orderId=null,recipient='',note='',items=[]}=req.body;
  if(!shipmentNumber||!Array.isArray(items)||!items.length) return res.status(400).json({error:'Укажите номер отгрузки и позиции'});
  const shipment=await tx(async c=>{
    const sh=(await c.query('INSERT INTO shipments(shipment_number,order_id,recipient,note,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [shipmentNumber,orderId,recipient,note,req.user.sub])).rows[0];
    for(const item of items){
      const qty=Number(item.quantity);
      if(!item.productId||!Number.isInteger(qty)||qty<=0) throw new Error('Проверьте позиции отгрузки');
      const stock=(await c.query('SELECT COALESCE(SUM(quantity_delta),0)::int qty FROM inventory_movements WHERE product_id=$1 FOR UPDATE',[item.productId])).rows[0].qty;
      if(stock<qty) throw new Error('На складе недостаточно продукции выбранной длины');
      await c.query('INSERT INTO shipment_items(shipment_id,product_id,quantity) VALUES($1,$2,$3)',[sh.id,item.productId,qty]);
      await c.query(`INSERT INTO inventory_movements(product_id,movement_type,quantity_delta,order_id,reference_id,created_by,note)
        VALUES($1,'shipment_out',$2,$3,$4,$5,$6)`,[item.productId,-qty,orderId,sh.id,req.user.sub,'Отгрузка '+shipmentNumber]);
    }
    await audit(c,req.user.sub,'create','shipment',sh.id,null,sh);
    return sh;
  });
  res.status(201).json(shipment);
}));

app.post('/api/payments', auth, roles('admin'), asyncRoute(async (req,res) => {
  const {shipmentId,amountMinor,note=''}=req.body;
  if(!shipmentId||!Number.isSafeInteger(Number(amountMinor))||Number(amountMinor)<0) return res.status(400).json({error:'Проверьте отгрузку и сумму'});
  const r=await pool.query('INSERT INTO payment_entries(shipment_id,amount_minor,note,created_by) VALUES($1,$2,$3,$4) RETURNING *',
    [shipmentId,Number(amountMinor),note,req.user.sub]);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/reports/monthly', auth, asyncRoute(async (req,res) => {
  const month=String(req.query.month||'');
  if(!/^\\d{4}-\\d{2}$/.test(month)) return res.status(400).json({error:'Укажите месяц в формате YYYY-MM'});
  const start=month+'-01';
  const r=await pool.query(`SELECT p.id,p.length_mm,COUNT(e.id)::int entries,
    COALESCE(SUM(e.quantity),0)::int quantity,COALESCE(SUM(e.total_minor),0)::text total_minor
    FROM products p LEFT JOIN production_entries e ON e.product_id=p.id AND e.work_date >= $1::date
      AND e.work_date < ($1::date + INTERVAL '1 month') AND e.voided_at IS NULL
    GROUP BY p.id ORDER BY p.length_mm`,[start]);
  const totals=r.rows.reduce((a,x)=>({quantity:a.quantity+Number(x.quantity),totalMinor:a.totalMinor+BigInt(x.total_minor)}),{quantity:0,totalMinor:0n});
  res.json({month,items:r.rows,total:{quantity:totals.quantity,totalMinor:totals.totalMinor.toString()}});
}));

app.post('/api/reports/close-month', auth, roles('admin'), asyncRoute(async (req,res) => {
  const month=String(req.body.month||'');
  if(!/^\\d{4}-\\d{2}$/.test(month)) return res.status(400).json({error:'Укажите месяц YYYY-MM'});
  const start=month+'-01';
  const report=await pool.query(`SELECT p.id,p.length_mm,COALESCE(SUM(e.quantity),0)::int quantity,
    COALESCE(SUM(e.total_minor),0)::text total_minor FROM products p
    LEFT JOIN production_entries e ON e.product_id=p.id AND e.work_date >= $1::date
      AND e.work_date < ($1::date + INTERVAL '1 month') AND e.voided_at IS NULL
    GROUP BY p.id ORDER BY p.length_mm`,[start]);
  const totals=report.rows.reduce((a,x)=>({quantity:a.quantity+Number(x.quantity),totalMinor:a.totalMinor+BigInt(x.total_minor)}),{quantity:0,totalMinor:0n});
  const snapshot={items:report.rows,total:{quantity:totals.quantity,totalMinor:totals.totalMinor.toString()}};
  const r=await pool.query('INSERT INTO monthly_closures(period_month,totals,closed_by) VALUES($1,$2,$3) RETURNING *',
    [start,JSON.stringify(snapshot),req.user.sub]);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/admin/login-log', auth, roles('admin'), asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT l.id,l.username_attempt,l.success,l.created_at,u.username
    FROM login_log l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.created_at DESC LIMIT 300`);
  res.json(r.rows);
}));

app.use((err,_req,res,_next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Внутренняя ошибка' });
});

async function start() {
  const schema=fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8');
  await pool.query(schema);
  const standardLengths=[1500,1700,2000,2250,2500,3000];
  for (const length of standardLengths) {
    await pool.query(`INSERT INTO products(code,length_mm) VALUES($1,$2) ON CONFLICT(code) DO NOTHING`,
      [`60x40-${length}`,length]);
  }
  await pool.query(`INSERT INTO teams(name) VALUES('Бригада 1') ON CONFLICT(name) DO NOTHING`);
  const initial=process.env.INITIAL_ADMIN_PASSWORD;
  if(initial) {
    const username=process.env.INITIAL_ADMIN_USERNAME || 'admin';
    const hash=await bcrypt.hash(initial,12);
    await pool.query(`INSERT INTO users(username,password_hash,role) VALUES($1,$2,'admin')
      ON CONFLICT(username) DO NOTHING`,[username,hash]);
  }
  app.listen(PORT,'0.0.0.0',()=>console.log(`Chappi Edition listening on ${PORT}`));
}
start().catch(e=>{console.error(e);process.exit(1);});
