const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBackup, validateBackupRelations, buildUserRestoreMap, buildRestorePlan, REQUIRED_TABLES, RESTORE_ORDER } = require('../src/backup');


function validBackup() {
  return {
    format:'chappi-backup-v1',
    createdAt:'2026-10-04T00:00:00.000Z',
    tables:Object.fromEntries(REQUIRED_TABLES.map(name => [name, []]))
  };
}

test('backup validator accepts the current export shape', () => {
  const backup = validBackup();
  backup.tables.users.push({id:'u1',username:'admin',role:'admin',worker_id:null,active:true,created_at:'2026-10-04'});
  const result = validateBackup(backup);
  assert.equal(result.format,'chappi-backup-v1');
  assert.equal(result.tableCounts.users,1);
});

test('backup validator rejects password hashes', () => {
  const backup = validBackup();
  backup.tables.users.push({id:'u1',username:'admin',role:'admin',password_hash:'secret'});
  assert.throws(() => validateBackup(backup), /password_hash/);
});

test('backup validator rejects missing required tables', () => {
  const backup = validBackup();
  delete backup.tables.production_entries;
  assert.throws(() => validateBackup(backup), /production_entries/);
});

test('backup validator rejects unknown backup format', () => {
  const backup = validBackup();
  backup.format='old-format';
  assert.throws(() => validateBackup(backup), /Неподдерживаемый формат/);
});


test('backup relation validator accepts valid references', () => {
  const backup = validBackup();
  backup.tables.workers.push({id:'w1'});
  backup.tables.teams.push({id:'t1'});
  backup.tables.users.push({id:'u1',username:'admin',role:'admin',worker_id:'w1'});
  backup.tables.production_entries.push({id:'p1',team_id:'t1',product_id:null,created_by:'u1'});
  assert.equal(validateBackupRelations(backup), true);
});

test('backup relation validator rejects dangling references', () => {
  const backup = validBackup();
  backup.tables.production_entries.push({id:'p1',team_id:'missing'});
  assert.throws(() => validateBackupRelations(backup), /Нарушена связь/);
});


test('restore plan is non-destructive dry-run', () => {
  const backup = validBackup();
  backup.tables.users.push({id:'backup-admin',username:'admin',role:'admin',worker_id:null});
  const plan = buildRestorePlan(backup,[{id:'current-admin',username:'admin',worker_id:null}]);
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.destructive, false);
  assert.equal(plan.passwordHashesRestored, false);
  assert.deepEqual(plan.restoreOrder, RESTORE_ORDER);
});


test('backup relation validator rejects duplicate ids', () => {
  const backup = validBackup();
  backup.tables.workers.push({id:'w1'},{id:'w1'});
  assert.throws(() => validateBackupRelations(backup), /Дублирующийся id/);
});

test('backup relation validator rejects duplicate usernames', () => {
  const backup = validBackup();
  backup.tables.users.push({id:'u1',username:'admin',role:'admin'},{id:'u2',username:'admin',role:'admin'});
  assert.throws(() => validateBackupRelations(backup), /Дублирующийся username/);
});


test('restore user mapping preserves current authentication by username', () => {
  const map = buildUserRestoreMap(
    [{id:'old-1',username:'admin'},{id:'old-2',username:'worker'}],
    [{id:'new-1',username:'admin'},{id:'new-2',username:'worker'}]
  );
  assert.deepEqual(map.idMap, {'old-1':'new-1','old-2':'new-2'});
  assert.deepEqual(map.missingUsernames, []);
});

test('restore plan blocks when a backup account is missing locally', () => {
  const backup = validBackup();
  backup.tables.users.push({id:'u1',username:'admin',role:'admin',worker_id:null});
  const plan = buildRestorePlan(backup,[{id:'current',username:'different',worker_id:null}]);
  assert.deepEqual(plan.missingBackupUsers,['admin']);
  assert.equal(plan.safeToRestore,false);
});

test('restore plan blocks when a preserved user points to a worker absent from backup', () => {
  const backup = validBackup();
  backup.tables.users.push({id:'u1',username:'admin',role:'admin',worker_id:'w1'});
  const plan = buildRestorePlan(backup,[{id:'current',username:'admin',worker_id:'missing-worker'}]);
  assert.equal(plan.currentUsersWithMissingWorkers.length,1);
  assert.equal(plan.safeToRestore,false);
});
