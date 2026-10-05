const { Pool } = require('pg');

const tables = [
  'shipment_allocations',
  'payment_entries',
  'shipment_items',
  'shipments',
  'production_allocations',
  'inventory_movements',
  'production_entries',
  'attendance_entries',
  'order_items',
  'orders',
  'daily_production_reports',
  'monthly_worker_earnings',
  'penny_events',
  'monthly_closures',
  'fund_entries',
  'rates',
  'month_states',
  'admin_recovery_codes',
  'audit_log',
  'login_log'
];

const keep = ['users','workers','teams','team_memberships','products'];

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('chappi:clean-test-data'))");
    const before = {};
    for (const table of [...tables, ...keep]) {
      before[table] = Number((await client.query('SELECT COUNT(*)::int AS n FROM ' + table)).rows[0].n);
    }
    for (const table of tables) await client.query('DELETE FROM ' + table);
    const after = {};
    for (const table of [...tables, ...keep]) {
      after[table] = Number((await client.query('SELECT COUNT(*)::int AS n FROM ' + table)).rows[0].n);
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ok:true,before,after}, null, 2));
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();