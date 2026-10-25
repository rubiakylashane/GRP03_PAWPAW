async function createNotification(client, userId, type, title, message) {
  if (!userId) return;
  await client.query(
    `INSERT INTO notification (user_id, notification_type, title, message)
     VALUES ($1, $2, $3, $4)`,
    [userId, type, title, message]
  );
}

async function notifyRole(client, role, type, title, message) {
  const result = await client.query(
    `INSERT INTO notification (user_id, notification_type, title, message)
     SELECT user_id, $2, $3, $4
     FROM user_account
     WHERE LOWER(role) = LOWER($1) AND account_status = 'Active'`,
    [role, type, title, message]
  );
  return result.rowCount;
}

async function writeAudit(client, userId, action, table, recordId, description) {
  const actionTypes = {
    create: 'INSERT',
    insert: 'INSERT',
    update: 'UPDATE',
    delete: 'DELETE',
    login: 'LOGIN',
    logout: 'LOGOUT'
  };
  const actionType = actionTypes[String(action || '').toLowerCase()];
  if (!actionType) throw new Error(`Unsupported audit action: ${action}`);

  await client.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId || null, actionType, table, recordId || null, description]
  );
}

module.exports = { createNotification, notifyRole, writeAudit };
