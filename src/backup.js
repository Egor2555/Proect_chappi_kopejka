const RESTORE_ORDER = [
  'workers','teams','products','users','team_memberships','rates','orders','order_items',
  'production_entries','production_allocations','attendance_entries','inventory_movements',
  'shipments','shipment_items','payment_entries','monthly_worker_earnings','monthly_closures',
  'penny_events','fund_entries','audit_log','login_log'
];

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

function buildRestorePlan(backup) {
  const summary = validateBackup(backup);
  validateBackupRelations(backup);
  return {
    format: summary.format,
    createdAt: summary.createdAt,
    tableCounts: summary.tableCounts,
    mode: 'dry-run',
    restoreOrder: RESTORE_ORDER.slice(),
    destructive: false,
    passwordHashesRestored: false
  };
}

function validateBackupRelations(backup) {
  const refs = [['users','worker_id','workers'],['team_memberships','worker_id','workers'],['team_memberships','team_id','teams'],['rates','product_id','products'],['rates','created_by','users'],['orders','created_by','users'],['order_items','order_id','orders'],['order_items','product_id','products'],['production_entries','team_id','teams'],['production_entries','product_id','products'],['production_entries','order_id','orders'],['production_entries','rate_id','rates'],['production_entries','created_by','users'],['attendance_entries','worker_id','workers'],['attendance_entries','team_id','teams'],['attendance_entries','created_by','users'],['inventory_movements','product_id','products'],['inventory_movements','production_entry_id','production_entries'],['inventory_movements','order_id','orders'],['inventory_movements','created_by','users'],['shipments','order_id','orders'],['shipments','created_by','users'],['shipment_items','shipment_id','shipments'],['shipment_items','product_id','products'],['payment_entries','shipment_id','shipments'],['payment_entries','created_by','users'],['monthly_closures','closed_by','users'],['penny_events','created_by','users'],['fund_entries','created_by','users'],['production_allocations','production_entry_id','production_entries'],['production_allocations','order_id','orders'],['production_allocations','product_id','products'],['monthly_worker_earnings','worker_id','workers'],['audit_log','actor_user_id','users'],['login_log','user_id','users']];
  for (const [table,column,parent] of refs) for (const row of backup.tables[table]) if(row[column]!=null && !backup.tables[parent].some(x=>String(x.id)===String(row[column]))) throw new Error('Нарушена связь: '+table+'.'+column+' -> '+parent);
  for (const table of REQUIRED_TABLES) {
    const ids = new Set();
    for (const row of backup.tables[table]) {
      if (row.id == null) continue;
      const id = String(row.id);
      if (ids.has(id)) throw new Error('Дублирующийся id в таблице: ' + table);
      ids.add(id);
    }
  }
  const usernames = new Set();
  for (const user of backup.tables.users) {
    const username = String(user.username);
    if (usernames.has(username)) throw new Error('Дублирующийся username: ' + username);
    usernames.add(username);
  }
  return true;
}

module.exports = { RESTORE_ORDER, REQUIRED_TABLES, validateBackup, validateBackupRelations, buildRestorePlan };
