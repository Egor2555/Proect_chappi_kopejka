const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBackup, REQUIRED_TABLES } = require('../src/backup');

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
