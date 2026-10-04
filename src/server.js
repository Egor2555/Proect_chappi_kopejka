const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { calculateMonthlyWorkerEarnings } = require('./domain');
const { validateBackup, validateBackupRelations, buildRestorePlan } = require('./backup');
const fs = require('node:fs');
const path = require('node:path');

const app = express();
app.set('trust proxy', 1);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET;
if (!process.env.DATABASE_URL || !JWT_SECRET) {
  console.error('DATABASE_URL and JWT_SECRET are required.');
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Слишком много попыток входа. Попробуйте позже.' } }));
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

app.post('/api/auth/change-password', auth, asyncRoute(async (req,res) => {
  const {currentPassword,newPassword}=req.body;
  if(typeof newPassword!=='string'||newPassword.length<10)
    return res.status(400).json({error:'Новый пароль должен содержать не менее 10 символов'});
  const found=await pool.query('SELECT password_hash FROM users WHERE id=$1 AND active=true',[req.user.sub]);
  if(!found.rowCount||!await bcrypt.compare(String(currentPassword||''),found.rows[0].password_hash))
    return res.status(400).json({error:'Текущий пароль указан неверно'});
  const hash=await bcrypt.hash(newPassword,12);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,req.user.sub]);
  await pool.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id) VALUES($1,'change_password','user',$2)",[req.user.sub,req.user.sub]);
  res.json({ok:true});
}));


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
        ORDER BY p.length_mm),'[]'::json) AS items
      FROM orders o JOIN order_items i ON i.order_id=o.id JOIN products p ON p.id=i.product_id
      LEFT JOIN LATERAL (SELECT SUM(a.quantity)::int qty FROM production_allocations a
        WHERE a.order_id=o.id AND a.product_id=i.product_id AND a.voided_at IS NULL) done ON true
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

app.patch('/api/products/:id/archive', auth, roles('admin'), asyncRoute(async (req,res) => {
  const before=(await pool.query('SELECT * FROM products WHERE id=$1',[req.params.id])).rows[0];
  if(!before) return res.status(404).json({error:'Типоразмер не найден'});
  const after=(await pool.query('UPDATE products SET active=false,archived_at=now() WHERE id=$1 RETURNING *',[req.params.id])).rows[0];
  await pool.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,'archive','product',$2,$3,$4)",
    [req.user.sub,after.id,JSON.stringify(before),JSON.stringify(after)]);
  res.json(after);
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

app.patch('/api/workers/:id/archive', auth, roles('admin'), asyncRoute(async (req,res) => {
  const before=(await pool.query('SELECT * FROM workers WHERE id=$1',[req.params.id])).rows[0];
  if(!before) return res.status(404).json({error:'Работник не найден'});
  const after=(await pool.query('UPDATE workers SET active=false,archived_at=now() WHERE id=$1 RETURNING *',[req.params.id])).rows[0];
  await pool.query('UPDATE users SET active=false WHERE worker_id=$1',[req.params.id]);
  await pool.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,'archive','worker',$2,$3,$4)",
    [req.user.sub,after.id,JSON.stringify(before),JSON.stringify(after)]);
  res.json(after);
}));

app.patch('/api/orders/:id/archive', auth, roles('admin'), asyncRoute(async (req,res) => {
  const before=(await pool.query('SELECT * FROM orders WHERE id=$1',[req.params.id])).rows[0];
  if(!before) return res.status(404).json({error:'Заказ не найден'});
  if(!['completed','cancelled'].includes(before.status)) return res.status(400).json({error:'В архив можно перенести только завершённый или отменённый заказ'});
  const after=(await pool.query("UPDATE orders SET status='archived' WHERE id=$1 RETURNING *",[req.params.id])).rows[0];
  await pool.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,'archive','order',$2,$3,$4)",
    [req.user.sub,after.id,JSON.stringify(before),JSON.stringify(after)]);
  res.json(after);
}));

app.post('/api/users', auth, roles('admin'), asyncRoute(async (req,res) => {
  const {username,password,role,workerId=null}=req.body;
  if(!username||!password||String(password).length<10||!['worker','brigadier','admin'].includes(role))
    return res.status(400).json({error:'Логин, пароль от 10 символов и допустимая роль обязательны'});
  if(['worker','brigadier'].includes(role)&&!workerId) return res.status(400).json({error:'Для учётной записи работника выберите карточку работника'});
  const hash=await bcrypt.hash(String(password),12);
  const r=await pool.query('INSERT INTO users(username,password_hash,role,worker_id) VALUES($1,$2,$3,$4) RETURNING id,username,role,worker_id,active',
    [String(username).trim(),hash,role,workerId]);
  await pool.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,after_data) VALUES($1,'create','user',$2,$3)",
    [req.user.sub,r.rows[0].id,JSON.stringify(r.rows[0])]);
  res.status(201).json(r.rows[0]);
}));

app.post('/api/team-memberships', auth, roles('admin'), asyncRoute(async (req,res) => {
  const {workerId,teamId,validFrom}=req.body;
  if(!workerId||!teamId||!validFrom) return res.status(400).json({error:'Выберите работника, бригаду и дату'});
  const result=await tx(async c=>{
    await c.query("UPDATE team_memberships SET valid_to=($1::date - INTERVAL '1 day')::date WHERE worker_id=$2 AND valid_to IS NULL",[validFrom,workerId]);
    return (await c.query('INSERT INTO team_memberships(worker_id,team_id,valid_from) VALUES($1,$2,$3) RETURNING *',[workerId,teamId,validFrom])).rows[0];
  });
  res.status(201).json(result);
}));

app.get('/api/attendance', auth, asyncRoute(async (req,res) => {
  const date=String(req.query.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({error:'Укажите дату YYYY-MM-DD'});
  const r=await pool.query(`SELECT a.worker_id,w.display_name,a.team_id,t.name team_name
    FROM attendance_entries a JOIN workers w ON w.id=a.worker_id JOIN teams t ON t.id=a.team_id
    WHERE a.work_date=$1 ORDER BY t.name,w.display_name`,[date]);
  res.json(r.rows);
}));

app.get('/api/teams', auth, asyncRoute(async (_req,res) => res.json((await pool.query('SELECT * FROM teams WHERE active=true ORDER BY name')).rows)));
app.post('/api/teams', auth, roles('admin'), asyncRoute(async (req,res) => {
  const name=String(req.body.name||'').trim(); if(!name) return res.status(400).json({error:'Укажите название бригады'});
  const r=await pool.query('INSERT INTO teams(name) VALUES($1) RETURNING *',[name]); res.status(201).json(r.rows[0]);
}));

app.post('/api/attendance', auth, roles('admin','brigadier'), asyncRoute(async (req,res) => {
  const {workDate,teamId,workerIds=[]}=req.body;
  if(!workDate||!teamId||!Array.isArray(workerIds)) return res.status(400).json({error:'Недостаточно данных'});
  if(req.user.role==='brigadier') {
    const allowed=await pool.query('SELECT 1 FROM team_memberships WHERE worker_id=$1 AND team_id=$2 AND valid_from<=$3 AND (valid_to IS NULL OR valid_to>=$3)',
      [req.user.workerId,teamId,workDate]);
    if(!allowed.rowCount) return res.status(403).json({error:'Можно отмечать только свою бригаду'});
  }
  const created=await tx(async c=>{
    for(const workerId of workerIds){
      const member=await c.query('SELECT 1 FROM team_memberships WHERE worker_id=$1 AND team_id=$2 AND valid_from<=$3 AND (valid_to IS NULL OR valid_to>=$3)',
        [workerId,teamId,workDate]);
      if(!member.rowCount) throw new Error('Работник не состоит в выбранной бригаде на эту дату');
    }
    const before=(await c.query('SELECT worker_id FROM attendance_entries WHERE work_date=$1 AND team_id=$2',[workDate,teamId])).rows;
    await c.query('DELETE FROM attendance_entries WHERE work_date=$1 AND team_id=$2',[workDate,teamId]);
    const rows=[];
    for(const workerId of workerIds){
      const r=await c.query('INSERT INTO attendance_entries(work_date,team_id,worker_id,created_by) VALUES($1,$2,$3,$4) RETURNING *',[workDate,teamId,workerId,req.user.sub]);
      rows.push(r.rows[0]);
    }
    await audit(c,req.user.sub,'replace_daily_attendance','attendance',teamId,{workDate,workers:before},{workDate,workerIds});
    return rows;
  });
  res.json(created);
}));

app.get('/api/rates', auth, asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT r.*,p.length_mm,p.code FROM rates r JOIN products p ON p.id=r.product_id ORDER BY r.period_month DESC,p.length_mm`);
  res.json(r.rows);
}));

app.post('/api/rates', auth, roles('admin'), asyncRoute(async (req,res) => {
  const {productId,periodMonth,amountMinor}=req.body;
  if(!productId||!/^\d{4}-\d{2}-01$/.test(periodMonth||'')||!Number.isSafeInteger(Number(amountMinor))||Number(amountMinor)<0)
    return res.status(400).json({error:'Проверьте изделие, месяц и сумму в копейках'});
  const result=await tx(async c=>{
    if((await c.query('SELECT 1 FROM monthly_closures WHERE period_month=$1',[periodMonth])).rowCount)
      throw new Error('Нельзя менять расценку закрытого месяца');
    const before=(await c.query('SELECT * FROM rates WHERE product_id=$1 AND period_month=$2',[productId,periodMonth])).rows[0]||null;
    const after=(await c.query(`INSERT INTO rates(product_id,period_month,amount_minor,created_by)
      VALUES($1,$2,$3,$4) ON CONFLICT(product_id,period_month) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,created_by=EXCLUDED.created_by
      RETURNING *`,[productId,periodMonth,Number(amountMinor),req.user.sub])).rows[0];
    await audit(c,req.user.sub,before?'update':'create','rate',after.id,before,after);
    return after;
  });
  res.status(201).json(result);
}));

app.get('/api/orders', auth, asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT o.*,COALESCE(json_agg(json_build_object('productId',i.product_id,'lengthMm',p.length_mm,'required',i.required_qty,
    'done',COALESCE(d.qty,0),'remaining',GREATEST(i.required_qty-COALESCE(d.qty,0),0)) ORDER BY p.length_mm),'[]') AS items
    FROM orders o JOIN order_items i ON i.order_id=o.id JOIN products p ON p.id=i.product_id
    LEFT JOIN LATERAL(SELECT SUM(a.quantity)::int qty FROM production_allocations a WHERE a.order_id=o.id AND a.product_id=i.product_id AND a.voided_at IS NULL)d ON true
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
  if(req.user.role==='brigadier') {
    const allowed=await pool.query('SELECT 1 FROM team_memberships WHERE worker_id=$1 AND team_id=$2 AND valid_from<=$3 AND (valid_to IS NULL OR valid_to>=$3)',
      [req.user.workerId,teamId,workDate]);
    if(!allowed.rowCount) return res.status(403).json({error:'Можно записывать производство только своей бригады'});
  }
  const result=await tx(async c=>{
    const month=String(workDate).slice(0,7)+'-01';
    const closed=(await c.query('SELECT 1 FROM monthly_closures WHERE period_month=$1',[month])).rowCount>0;
    if(closed) throw new Error('Этот месяц уже закрыт. Новое производство запрещено до отдельной процедуры корректировки.');
    const p=(await c.query(`INSERT INTO production_entries(work_date,team_id,product_id,order_id,quantity,rate_id,rate_snapshot_minor,total_minor,note,created_by)
      VALUES($1,$2,$3,$4,$5,NULL,NULL,0,$6,$7) RETURNING *`,
      [workDate,teamId,productId,orderId,Number(quantity),note,req.user.sub])).rows[0];
    let remaining=Number(quantity);
    if(orderId){
      const requested=(await c.query('SELECT required_qty FROM order_items WHERE order_id=$1 AND product_id=$2',[orderId,productId])).rows[0];
      const done=(await c.query('SELECT COALESCE(SUM(quantity),0)::int qty FROM production_allocations WHERE order_id=$1 AND product_id=$2',[orderId,productId])).rows[0].qty;
      if(!requested) throw new Error('В заказе нет выбранного типоразмера');
      const needBefore=Math.max(0,Number(requested.required_qty)-Number(done));
      const direct=Math.min(Number(quantity),needBefore);
      if(direct>0) await c.query(`INSERT INTO production_allocations(production_entry_id,order_id,product_id,quantity,allocation_type) VALUES($1,$2,$3,$4,'direct')`,[p.id,orderId,productId,direct]);
      remaining=Number(quantity)-direct;
    }
    const assigned=Math.max(0,Number(quantity)-remaining);
    if(assigned>0) await c.query(`INSERT INTO inventory_movements(product_id,movement_type,quantity_delta,production_entry_id,order_id,created_by)
      VALUES($1,'production_in',$2,$3,$4,$5)`,[productId,assigned,p.id,orderId,req.user.sub]);
    if(remaining>0){
      const candidates=(await c.query(`SELECT o.id,i.required_qty,
        COALESCE((SELECT SUM(a.quantity)::int FROM production_allocations a WHERE a.voided_at IS NULL AND a.order_id=o.id AND a.product_id=i.product_id),0) done
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
          COALESCE((SELECT SUM(a.quantity)::int FROM production_allocations a WHERE a.voided_at IS NULL AND a.order_id=i.order_id AND a.product_id=i.product_id),0)`,[candidate.id])).rows[0].n;
        if(candidateMissing===0) {
          await c.query("UPDATE orders SET status='completed',completed_at=now() WHERE id=$1",[candidate.id]);
          await c.query(`UPDATE orders SET status='active' WHERE id=(
            SELECT id FROM orders WHERE status='queued' ORDER BY priority DESC,created_at ASC LIMIT 1
          ) AND NOT EXISTS (SELECT 1 FROM orders WHERE status='active')`);
        } else await c.query("UPDATE orders SET status='active' WHERE id=$1 AND status='queued' AND NOT EXISTS (SELECT 1 FROM orders WHERE status='active')",[candidate.id]);
        if(!remaining) break;
      }
    }
    if(remaining>0) await c.query(`INSERT INTO inventory_movements(product_id,movement_type,quantity_delta,production_entry_id,created_by,note)
      VALUES($1,'production_in',$2,$3,$4,'Излишек на свободный склад')`,[productId,remaining,p.id,req.user.sub]);
    if(orderId){
      const missing=(await c.query(`SELECT COUNT(*)::int n FROM order_items i WHERE i.order_id=$1 AND i.required_qty >
        COALESCE((SELECT SUM(a.quantity)::int FROM production_allocations a WHERE a.voided_at IS NULL AND a.order_id=i.order_id AND a.product_id=i.product_id),0)`,[orderId])).rows[0].n;
      if(missing===0) {
        await c.query("UPDATE orders SET status='completed',completed_at=now() WHERE id=$1",[orderId]);
        await c.query(`UPDATE orders SET status='active' WHERE id=(
          SELECT id FROM orders WHERE status='queued' ORDER BY priority DESC,created_at ASC LIMIT 1
        ) AND NOT EXISTS (SELECT 1 FROM orders WHERE status='active')`);
      } else await c.query("UPDATE orders SET status='active' WHERE id=$1 AND status='queued'",[orderId]);
    }
    await audit(c,req.user.sub,'create','production_entry',p.id,null,p);
    return p;
  });
  res.status(201).json(result);
}));

app.get('/api/production', auth, roles('admin','brigadier'), asyncRoute(async (req,res) => {
  const date=String(req.query.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({error:'Укажите дату YYYY-MM-DD'});
  const params=[date];
  let teamFilter='';
  if(req.user.role==='brigadier') { params.push(req.user.workerId); teamFilter=' AND e.team_id IN (SELECT team_id FROM team_memberships WHERE worker_id=$2 AND valid_from<=$1 AND (valid_to IS NULL OR valid_to>=$1))'; }
  const r=await pool.query(`SELECT e.*,p.length_mm,p.section_width_mm,p.section_height_mm,t.name team_name,o.order_number,u.username created_by_name
    FROM production_entries e JOIN products p ON p.id=e.product_id JOIN teams t ON t.id=e.team_id
    LEFT JOIN orders o ON o.id=e.order_id JOIN users u ON u.id=e.created_by
    WHERE e.work_date=$1 AND e.voided_at IS NULL `+teamFilter+` ORDER BY e.created_at DESC`,params);
  res.json(r.rows);
}));

app.post('/api/production/:id/void', auth, roles('admin'), asyncRoute(async (req,res) => {
  const reason=String(req.body.reason||'').trim();
  if(!reason) return res.status(400).json({error:'Укажите причину исправления'});
  const result=await tx(async c=>{
    const entry=(await c.query('SELECT * FROM production_entries WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
    if(!entry||entry.voided_at) throw new Error('Запись не найдена или уже отменена');
    const month=String(entry.work_date).slice(0,7)+'-01';
    if((await c.query('SELECT 1 FROM monthly_closures WHERE period_month=$1',[month])).rowCount) throw new Error('Закрытый месяц нельзя исправлять обычной операцией');
    const affectedOrders=(await c.query('SELECT DISTINCT order_id FROM production_allocations WHERE production_entry_id=$1 AND voided_at IS NULL',[entry.id])).rows.map(x=>x.order_id);
    const movements=(await c.query('SELECT * FROM inventory_movements WHERE production_entry_id=$1',[entry.id])).rows;
    for(const movement of movements) {
      const reverse=-Number(movement.quantity_delta);
      const current=Number((await c.query('SELECT COALESCE(SUM(quantity_delta),0)::int qty FROM inventory_movements WHERE product_id=$1',[movement.product_id])).rows[0].qty);
      if(current+reverse<0) throw new Error('Нельзя отменить запись: часть этой продукции уже отгружена, склад станет отрицательным');
      await c.query(`INSERT INTO inventory_movements(product_id,movement_type,quantity_delta,production_entry_id,order_id,created_by,note)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [movement.product_id,reverse>0?'adjustment_in':'adjustment_out',reverse,entry.id,movement.order_id,req.user.sub,'Сторно записи: '+reason]);
    }
    await c.query('UPDATE production_allocations SET voided_at=now() WHERE production_entry_id=$1 AND voided_at IS NULL',[entry.id]);
    for(const orderId of affectedOrders) {
      const missing=(await c.query(`SELECT COUNT(*)::int n FROM order_items i WHERE i.order_id=$1 AND i.required_qty >
        COALESCE((SELECT SUM(a.quantity)::int FROM production_allocations a WHERE a.order_id=i.order_id AND a.product_id=i.product_id AND a.voided_at IS NULL),0)`,[orderId])).rows[0].n;
      if(missing>0) await c.query("UPDATE orders SET status='active',completed_at=NULL WHERE id=$1",[orderId]);
    }
    const updated=(await c.query('UPDATE production_entries SET voided_at=now(),void_reason=$2,updated_at=now() WHERE id=$1 RETURNING *',[entry.id,reason])).rows[0];
    await audit(c,req.user.sub,'void','production_entry',entry.id,entry,updated,reason);
    return updated;
  });
  res.json(result);
}));

app.get('/api/stock', auth, asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT p.id,p.code,p.length_mm,COALESCE(SUM(m.quantity_delta),0)::int quantity
    FROM products p LEFT JOIN inventory_movements m ON m.product_id=p.id
    GROUP BY p.id ORDER BY p.length_mm`);
  res.json(r.rows);
}));

app.get('/api/shipments', auth, asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT s.*,COALESCE(json_agg(json_build_object('lengthMm',p.length_mm,'quantity',i.quantity)) FILTER (WHERE i.id IS NOT NULL),'[]') items
    FROM shipments s LEFT JOIN shipment_items i ON i.shipment_id=s.id LEFT JOIN products p ON p.id=i.product_id
    GROUP BY s.id ORDER BY s.shipped_at DESC LIMIT 200`);
  res.json(r.rows);
}));

app.patch('/api/orders/:id/priority', auth, roles('admin'), asyncRoute(async (req,res) => {
  const priority=Number(req.body.priority);
  if(!Number.isInteger(priority)||priority<0) return res.status(400).json({error:'Приоритет должен быть целым числом от 0'});
  const r=await pool.query('UPDATE orders SET priority=$1 WHERE id=$2 RETURNING *',[priority,req.params.id]);
  if(!r.rowCount) return res.status(404).json({error:'Заказ не найден'});
  await pool.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,after_data) VALUES($1,'priority_change','order',$2,$3)",
    [req.user.sub,r.rows[0].id,JSON.stringify(r.rows[0])]);
  res.json(r.rows[0]);
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
      await c.query('SELECT id FROM products WHERE id=$1 FOR UPDATE',[item.productId]);
      const stock=(await c.query('SELECT COALESCE(SUM(quantity_delta),0)::int qty FROM inventory_movements WHERE product_id=$1',[item.productId])).rows[0].qty;
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

app.get('/api/payments', auth, roles('admin'), asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT p.*,s.shipment_number FROM payment_entries p JOIN shipments s ON s.id=p.shipment_id ORDER BY p.credited_at DESC`);
  res.json(r.rows);
}));

app.post('/api/payments', auth, roles('admin'), asyncRoute(async (req,res) => {
  const {shipmentId,amountMinor,note=''}=req.body;
  if(!shipmentId||!Number.isSafeInteger(Number(amountMinor))||Number(amountMinor)<0) return res.status(400).json({error:'Проверьте отгрузку и сумму'});
  const result=await tx(async c=>{
    const payment=(await c.query('INSERT INTO payment_entries(shipment_id,amount_minor,note,created_by) VALUES($1,$2,$3,$4) RETURNING *',
      [shipmentId,Number(amountMinor),note,req.user.sub])).rows[0];
    await audit(c,req.user.sub,'create','payment',payment.id,null,payment);
    return payment;
  });
  res.status(201).json(result);
}));

app.get('/api/reports/monthly', auth, asyncRoute(async (req,res) => {
  const month=String(req.query.month||'');
  if(!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({error:'Укажите месяц в формате YYYY-MM'});
  if(req.user.role==='worker' && month!==new Date().toISOString().slice(0,7))
    return res.status(403).json({error:'Работнику доступен отчёт только за текущий месяц; прошлые периоды находятся в архиве'});
  const start=month+'-01';
  const r=await pool.query(`SELECT p.id,p.length_mm,COUNT(e.id)::int entries,
    COALESCE(SUM(e.quantity),0)::int quantity,
    r.amount_minor::text rate_minor,
    CASE WHEN r.amount_minor IS NULL THEN NULL ELSE (COALESCE(SUM(e.quantity),0)::bigint*r.amount_minor)::text END total_minor
    FROM products p
    LEFT JOIN production_entries e ON e.product_id=p.id AND e.work_date >= $1::date
      AND e.work_date < ($1::date + INTERVAL '1 month') AND e.voided_at IS NULL
    LEFT JOIN rates r ON r.product_id=p.id AND r.period_month=$1::date
    GROUP BY p.id,r.amount_minor ORDER BY p.length_mm`,[start]);
  const produced=r.rows.filter(x=>Number(x.quantity)>0);
  const missing=produced.filter(x=>x.rate_minor===null).map(x=>x.length_mm);
  const totals=produced.reduce((a,x)=>({quantity:a.quantity+Number(x.quantity),totalMinor:a.totalMinor+(x.total_minor?BigInt(x.total_minor):0n)}),{quantity:0,totalMinor:0n});
  const earnings=await pool.query(`SELECT e.worker_id,w.display_name,e.amount_minor,e.work_days,e.daily_details
    FROM monthly_worker_earnings e JOIN workers w ON w.id=e.worker_id
    WHERE e.period_month=$1 ${req.user.role==='worker' ? 'AND e.worker_id=$2' : ''} ORDER BY w.display_name`,
    req.user.role==='worker' ? [start,req.user.workerId] : [start]);
  res.json({month,items:r.rows,total:{quantity:totals.quantity,totalMinor:totals.totalMinor.toString()},missingRates:missing,earnings:earnings.rows});
}));

app.post('/api/reports/close-month', auth, roles('admin'), asyncRoute(async (req,res) => {
  const month=String(req.body.month||'');
  if(!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({error:'Укажите месяц YYYY-MM'});
  const start=month+'-01';
  let result;
  try {
    result=await tx(async c=>{
    if((await c.query('SELECT 1 FROM monthly_closures WHERE period_month=$1',[start])).rowCount)
      throw new Error('Этот месяц уже закрыт');
    const items=(await c.query(`SELECT p.id,p.length_mm,COALESCE(SUM(e.quantity),0)::int quantity,
      r.amount_minor::text rate_minor,
      CASE WHEN r.amount_minor IS NULL THEN NULL ELSE (COALESCE(SUM(e.quantity),0)::bigint*r.amount_minor)::text END total_minor
      FROM products p
      LEFT JOIN production_entries e ON e.product_id=p.id AND e.work_date >= $1::date
        AND e.work_date < ($1::date + INTERVAL '1 month') AND e.voided_at IS NULL
      LEFT JOIN rates r ON r.product_id=p.id AND r.period_month=$1::date
      GROUP BY p.id,r.amount_minor ORDER BY p.length_mm`,[start])).rows;
    const produced=items.filter(x=>Number(x.quantity)>0);
    const missing=produced.filter(x=>x.rate_minor===null).map(x=>(Number(x.length_mm)/1000)+' м');
    if(missing.length) throw new Error('Не заданы расценки: '+missing.join(', '));
    const attendance=(await c.query(`SELECT a.work_date,a.team_id,COUNT(*)::int worker_count,
      array_agg(json_build_object('workerId',a.worker_id,'name',w.display_name) ORDER BY w.display_name) workers
      FROM attendance_entries a JOIN workers w ON w.id=a.worker_id
      WHERE a.work_date >= $1::date AND a.work_date < ($1::date + INTERVAL '1 month')
      GROUP BY a.work_date,a.team_id ORDER BY a.work_date,a.team_id`,[start])).rows;
    const prodDays=(await c.query(`SELECT e.work_date,e.team_id,SUM(e.quantity)::int quantity,
      SUM((e.quantity::bigint*r.amount_minor))::text total_minor
      FROM production_entries e JOIN rates r ON r.product_id=e.product_id AND r.period_month=$1::date
      WHERE e.work_date >= $1::date AND e.work_date < ($1::date + INTERVAL '1 month') AND e.voided_at IS NULL
      GROUP BY e.work_date,e.team_id ORDER BY e.work_date,e.team_id`,[start])).rows;
    const attendanceMap=new Map(attendance.map(x=>[String(x.work_date)+'|'+x.team_id,x]));
    const calculationDays=prodDays.map(day=>{
      const a=attendanceMap.get(String(day.work_date)+'|'+day.team_id);
      if(!a || Number(a.worker_count)<1) throw new Error('Нет отмеченных работников: '+String(day.work_date));
      return {
        date:String(day.work_date),
        teamId:day.team_id,
        totalMinor:day.total_minor,
        workerIds:a.workers.map(person=>person.workerId)
      };
    });
    const calculation=calculateMonthlyWorkerEarnings(calculationDays);
    for(const earning of calculation.earnings){
      await c.query(`INSERT INTO monthly_worker_earnings(period_month,worker_id,amount_minor,work_days,daily_details)
        VALUES($1,$2,$3,$4,$5)`,
        [start,earning.workerId,earning.amountMinor,earning.workDays,JSON.stringify(earning.dailyDetails)]);
    }
    const residualMinor=BigInt(calculation.residualMinor);
    const workerTotals=new Map(calculation.earnings.map(x=>[x.workerId,BigInt(x.amountMinor)]));
    const totalMinor=produced.reduce((sum,x)=>sum+BigInt(x.total_minor||0),0n);
    const snapshot={items,total:{quantity:produced.reduce((n,x)=>n+Number(x.quantity),0),totalMinor:totalMinor.toString()},
      earnings:[...workerTotals.entries()].map(([workerId,amount])=>({workerId,amountMinor:amount.toString()})),
      ratesEntered:true,
      happyKopeck:{status:residualMinor>0n?'pending':'not_needed',residualMinor:residualMinor.toString()}};
    const closure=(await c.query('INSERT INTO monthly_closures(period_month,totals,closed_by) VALUES($1,$2,$3) RETURNING *',
      [start,JSON.stringify(snapshot),req.user.sub])).rows[0];
    await audit(c,req.user.sub,'close_month','monthly_closure',closure.id,null,snapshot);
    return closure;
    });
  } catch (error) {
    // The UNIQUE(period_month) constraint is the final guard against two admins
    // closing the same month concurrently. Turn that race into a clear client error.
    if(error && error.code==='23505' && String(error.constraint||'').includes('monthly_closures'))
      return res.status(409).json({error:'Этот месяц уже закрыт'});
    throw error;
  }
  res.status(201).json(result);
}));

app.get('/api/fund', auth, asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT COALESCE(SUM(CASE WHEN entry_type='income' THEN amount_minor
    WHEN entry_type='expense' THEN -amount_minor ELSE 0 END),0)::text balance_minor,
    COALESCE(SUM(CASE WHEN entry_type='income' THEN amount_minor ELSE 0 END),0)::text income_minor,
    COALESCE(SUM(CASE WHEN entry_type='expense' THEN amount_minor ELSE 0 END),0)::text expense_minor
    FROM fund_entries`);
  const entries=await pool.query('SELECT * FROM fund_entries ORDER BY entry_date DESC,created_at DESC LIMIT 200');
  res.json({summary:r.rows[0],entries:entries.rows});
}));

app.post('/api/fund', auth, roles('admin'), asyncRoute(async (req,res) => {
  const {entryDate,entryType,amountMinor,note}=req.body;
  if(!entryDate||!['income','expense'].includes(entryType)||!Number.isSafeInteger(Number(amountMinor))||Number(amountMinor)<0||!note)
    return res.status(400).json({error:'Проверьте дату, тип, сумму и пояснение'});
  const result=await tx(async c=>{
    const entry=(await c.query('INSERT INTO fund_entries(entry_date,entry_type,amount_minor,note,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',
      [entryDate,entryType,Number(amountMinor),note,req.user.sub])).rows[0];
    await audit(c,req.user.sub,'create','fund_entry',entry.id,null,entry);
    return entry;
  });
  res.status(201).json(result);
}));

app.get('/api/archive/months', auth, asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT * FROM monthly_closures
    WHERE period_month >= date_trunc('month',CURRENT_DATE - INTERVAL '5 months')::date
    ORDER BY period_month DESC`);
  res.json(r.rows);
}));

app.post('/api/admin/mode-event', auth, roles('admin'), asyncRoute(async (req,res) => {
  const r=await pool.query("INSERT INTO audit_log(actor_user_id,action,entity_type,entity_id,after_data) VALUES($1,'admin_mode_open','system','admin-mode',$2) RETURNING id,created_at",
    [req.user.sub,JSON.stringify({source:'admin-panel'})]);
  res.status(201).json(r.rows[0]);
}));

app.get('/api/admin/audit-log', auth, roles('admin'), asyncRoute(async (_req,res) => {
  const r=await pool.query(`SELECT a.id,u.username,a.action,a.entity_type,a.entity_id,a.before_data,a.after_data,a.reason,a.created_at
    FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 500`);
  res.json(r.rows);
}));

app.post('/api/admin/restore/dry-run', auth, roles('admin'), asyncRoute(async (req,res) => {
  const plan = buildRestorePlan(req.body);
  res.json(plan);
}));

app.get('/api/admin/export', auth, roles('admin'), asyncRoute(async (_req,res) => {
  const tables=['workers','teams','team_memberships','products','rates','orders','order_items','monthly_worker_earnings',
    'production_entries','production_allocations','attendance_entries','inventory_movements',
    'shipments','shipment_items','payment_entries','monthly_closures','penny_events','fund_entries','audit_log','login_log'];
  const backup={format:'chappi-backup-v1',createdAt:new Date().toISOString(),tables:{}};
  for(const table of tables) backup.tables[table]=(await pool.query('SELECT * FROM '+table)).rows;
  backup.tables.users=(await pool.query('SELECT id,username,role,worker_id,active,created_at FROM users')).rows;
  validateBackup(backup);
  validateBackupRelations(backup);
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="chappi-backup.json"');
  res.send(JSON.stringify(backup,null,2));
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
