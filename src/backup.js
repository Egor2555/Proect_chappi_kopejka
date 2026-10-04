const REQUIRED_TABLES = [
  'workers','teams','team_memberships','products','rates','orders','order_items',
  'monthly_worker_earnings','production_entries','production_allocations',
  'attendance_entries','inventory_movements','shipments','shipment_items',
  'payment_entries','monthly_closures','penny_events','fund_entries',
  'audit_log','login_log','users'
];

function validateBackup(backup) {
  if (!backup || typeof backup !== 'object') throw new Error('Некорректный backup');
  if (backup.format !== 'chappi-backup-v1') throw new Error('Неподдерживаемый формат backup');
  if (!backup.tables || typeof backup.tables !== 'object') throw new Error('В backup отсутствует tables');

  for (const table of REQUIRED_TABLES) {
    if (!Array.isArray(backup.tables[table])) throw new Error('В backup отсутствует таблица: ' + table);
  }

  for (const user of backup.tables.users) {
    if (Object.prototype.hasOwnProperty.call(user, 'password_hash')) throw new Error('Backup не должен содержать password_hash');
    if (!user.id || !user.username || !user.role) throw new Error('Повреждённая запись пользователя');
  }

  return {
    format: backup.format,
    createdAt: backup.createdAt || null,
    tableCounts: Object.fromEntries(REQUIRED_TABLES.map(t => [t, backup.tables[t].length]))
  };
}

module.exports = { REQUIRED_TABLES, validateBackup };
