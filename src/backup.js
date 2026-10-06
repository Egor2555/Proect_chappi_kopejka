const RESTORE_ORDER = [
  'workers','teams','products','users','team_memberships','worker_role_history','month_states','daily_production_reports','rates','orders','order_items',
  'production_entries','production_allocations','attendance_entries','inventory_movements',
  'shipments','shipment_items','shipment_allocations','payment_entries','monthly_worker_earnings','monthly_closures',
  'penny_events','fund_entries','audit_log','login_log'
];

const REQUIRED_TABLES = [
  'workers','teams','team_memberships','worker_role_history','month_states','daily_production_reports','products','rates','orders','order_items',
  'monthly_worker_earnings','production_entries','production_allocations',
  'attendance_entries','inventory_movements','shipments','shipment_items','shipment_allocations',
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

function buildUserRestoreMap(backupUsers, existingUsers) {
  const currentByUsername = new Map(existingUsers.map(u => [String(u.username), String(u.id)]));
  const idMap = {};
  const missingUsernames = [];
  for (const user of backupUsers) {
    const currentId = currentByUsername.get(String(user.username));
    if (!currentId) missingUsernames.push(String(user.username));
    else idMap[String(user.id)] = currentId;
  }
  return {
    idMap,
    missingUsernames,
    matchedUsers: backupUsers.filter(u => currentByUsername.has(String(u.username))).length
  };
}

const USER_REFERENCE_COLUMNS = {
  rates: ['created_by'],
  orders: ['created_by'],
  production_entries: ['created_by'],
  attendance_entries: ['created_by'],
  inventory_movements: ['created_by'],
  shipments: ['created_by'],
  payment_entries: ['created_by'],
  monthly_closures: ['closed_by'],
  month_states: ['brigadier_closed_by','reopened_by','finalized_by'],
  penny_events: ['created_by'],
  fund_entries: ['created_by'],
  audit_log: ['actor_user_id'],
  login_log: ['user_id']
};

function remapUserReferences(table, row, userIdMap) {
  const copy = { ...row };
  for (const column of USER_REFERENCE_COLUMNS[table] || []) {
    if (copy[column] != null) {
      const mapped = userIdMap[String(copy[column])];
      if (!mapped) throw new Error('Не удалось сопоставить пользователя: ' + copy[column] + ' в ' + table + '.' + column);
      copy[column] = mapped;
    }
  }
  return copy;
}

function buildRestorePlan(backup, existingUsers = []) {
  const summary = validateBackup(backup);
  validateBackupRelations(backup);
  const userMap = buildUserRestoreMap(backup.tables.users, existingUsers);
  const backupWorkerIds = new Set(backup.tables.workers.map(w => String(w.id)));
  const currentUsersWithMissingWorkers = existingUsers
    .filter(u => u.worker_id != null && !backupWorkerIds.has(String(u.worker_id)))
    .map(u => ({ username: String(u.username), workerId: String(u.worker_id) }));
  const backupUsersByUsername = new Map(backup.tables.users.map(u => [String(u.username), u]));
  const currentUsersWithWorkerMismatch = existingUsers
    .filter(u => backupUsersByUsername.has(String(u.username)))
    .filter(u => String(u.worker_id ?? '') !== String(backupUsersByUsername.get(String(u.username)).worker_id ?? ''))
    .map(u => ({
      username: String(u.username),
      currentWorkerId: u.worker_id == null ? null : String(u.worker_id),
      backupWorkerId: backupUsersByUsername.get(String(u.username)).worker_id == null
        ? null : String(backupUsersByUsername.get(String(u.username)).worker_id)
    }));
  return {
    format: summary.format,
    createdAt: summary.createdAt,
    tableCounts: summary.tableCounts,
    mode: 'dry-run',
    restoreOrder: RESTORE_ORDER.slice(),
    destructive: false,
    passwordHashesRestored: false,
    usersRestored: false,
    authMode: 'preserve-existing-users-by-username',
    userIdMap: userMap.idMap,
    missingBackupUsers: userMap.missingUsernames,
    matchedUsers: userMap.matchedUsers,
    currentUsersWithMissingWorkers,
    currentUsersWithWorkerMismatch,
    requiresExistingUsers: true,
    safeToRestore: userMap.missingUsernames.length === 0 && currentUsersWithMissingWorkers.length === 0 && currentUsersWithWorkerMismatch.length === 0
  };
}

function validateBackupRelations(backup) {
  const refs = [['users','worker_id','workers'],['daily_production_reports','team_id','teams'],['daily_production_reports','created_by','users'],['team_memberships','worker_id','workers'],['worker_role_history','worker_id','workers'],['month_states','brigadier_closed_by','users'],['month_states','reopened_by','users'],['month_states','finalized_by','users'],['team_memberships','team_id','teams'],['rates','product_id','products'],['rates','created_by','users'],['orders','created_by','users'],['order_items','order_id','orders'],['order_items','product_id','products'],['production_entries','team_id','teams'],['production_entries','product_id','products'],['production_entries','daily_report_id','daily_production_reports'],['production_entries','order_id','orders'],['production_entries','rate_id','rates'],['production_entries','created_by','users'],['attendance_entries','worker_id','workers'],['attendance_entries','team_id','teams'],['attendance_entries','created_by','users'],['inventory_movements','product_id','products'],['inventory_movements','production_entry_id','production_entries'],['inventory_movements','order_id','orders'],['inventory_movements','created_by','users'],['shipments','order_id','orders'],['shipments','created_by','users'],['shipment_items','shipment_id','shipments'],['shipment_items','product_id','products'],['shipment_allocations','shipment_item_id','shipment_items'],['shipment_allocations','inventory_movement_id','inventory_movements'],['shipment_allocations','reservation_movement_id','inventory_movements'],['payment_entries','shipment_id','shipments'],['payment_entries','created_by','users'],['monthly_closures','closed_by','users'],['penny_events','created_by','users'],['fund_entries','created_by','users'],['production_allocations','production_entry_id','production_entries'],['production_allocations','order_id','orders'],['production_allocations','product_id','products'],['monthly_worker_earnings','worker_id','workers'],['audit_log','actor_user_id','users'],['login_log','user_id','users']];
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

module.exports = { RESTORE_ORDER, REQUIRED_TABLES, USER_REFERENCE_COLUMNS, validateBackup, validateBackupRelations, buildUserRestoreMap, buildRestorePlan, remapUserReferences };
