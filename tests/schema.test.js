const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

test('PostgreSQL schema creates the complete core domain', { skip: !process.env.DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    await pool.query(schema);
    const r = await pool.query(`SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'`);
    const names = new Set(r.rows.map(x => x.table_name));
    for (const name of ['users','workers','teams','products','rates','orders','order_items',
      'production_entries','production_allocations','inventory_movements','shipments',
      'shipment_items','payment_entries','attendance_entries','audit_log','login_log',
      'monthly_closures','monthly_worker_earnings','penny_events','fund_entries']) assert.ok(names.has(name), 'missing table: '+name);
    const lengths = await pool.query('SELECT length_mm FROM products ORDER BY length_mm');
    assert.deepEqual(lengths.rows.map(x=>x.length_mm), [1500,1700,2000,2250,2500,2500,3000,3000,5000,6000]);
  } finally {
    await pool.end();
  }
});
