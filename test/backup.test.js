const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateBackup,
  validateBackupRelations,
  buildUserRestoreMap,
  buildRestorePlan
} = require('../src/backup');

function emptyBackup() {
  const tables = {};
  const required = [
    'workers','teams','team_memberships','worker_role_history','month_states','daily_production_reports','products','rates','orders','order_items',
    'monthly_worker_earnings','production_entries','production_allocations',
    'attendance_entries','inventory_movements','shipments','shipment_items',
    'shipment_allocations','payment_entries','monthly_closures','penny_events',
    'fund_entries','audit_log','login_log','users','worker_role_history','month_states'
  ];
  for (const table of required) tables[table] = [];
  return { format: 'chappi-backup-v1', tables };
}

test('backup validation rejects password hashes', () => {
  const backup = emptyBackup();
  backup.tables.users.push({ id: 'u1', username: 'admin', role: 'admin', password_hash: 'secret' });
  assert.throws(() => validateBackup(backup), /password_hash/);
});

test('backup validation rejects broken foreign-key-like relations', () => {
  const backup = emptyBackup();
  backup.tables.workers.push({ id: 'w1' });
  backup.tables.users.push({ id: 'u1', username: 'admin', role: 'admin', worker_id: 'missing' });
  assert.throws(() => validateBackupRelations(backup), /users.worker_id/);
});

test('restore map matches users by username, not backup user id', () => {
  const map = buildUserRestoreMap(
    [{ id: 'old-admin', username: 'admin', role: 'admin' }],
    [{ id: 'new-admin', username: 'admin', role: 'admin' }]
  );
  assert.deepEqual(map.idMap, { 'old-admin': 'new-admin' });
  assert.deepEqual(map.missingUsernames, []);
});

test('restore plan refuses missing existing users and worker mismatches', () => {
  const backup = emptyBackup();
  backup.tables.users.push({ id: 'u1', username: 'admin', role: 'admin', worker_id: null });

  const plan = buildRestorePlan(backup, [
    { id: 'current-admin', username: 'admin', role: 'admin', worker_id: 'worker-1' }
  ]);

  assert.equal(plan.safeToRestore, false);
  assert.equal(plan.currentUsersWithWorkerMismatch.length, 1);
});
