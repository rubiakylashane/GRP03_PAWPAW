const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticate, issueToken } = require('../middleware/auth');
const { asyncRoute, requiredString, notFound } = require('../utils/http');

const router = express.Router();
const ROLE_TO_UI = {
  'Pet Owner': 'owner',
  Veterinarian: 'vet',
  Staff: 'staff',
  Admin: 'admin'
};
const UI_TO_ROLE = Object.fromEntries(Object.entries(ROLE_TO_UI).map(([dbRole, uiRole]) => [uiRole, dbRole]));

async function writeAudit(client, userId, action, table, recordId, description) {
  await client.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId || null, action, table, recordId || null, description]
  );
}

async function profileFor(client, userId) {
  const { rows } = await client.query(
    `SELECT u.user_id, u.username, u.role, u.email, COALESCE(u.phone, o.phone, v.phone) AS phone,
            u.display_name, o.photo,
            o.owner_id, o.name AS owner_name, o.address, o.registration_date,
            v.veterinarian_id, v.name AS veterinarian_name, v.specialization, v.license_number
       FROM user_account u
       LEFT JOIN owner o ON o.user_id = u.user_id
       LEFT JOIN veterinarian v ON v.user_id = u.user_id
      WHERE u.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

function publicUser(row) {
  const role = ROLE_TO_UI[row.role];
  const displayName = row.display_name || row.owner_name || row.veterinarian_name || row.username;
  return {
    userId: row.user_id,
    id: row.user_id,
    username: row.username,
    role,
    email: row.email,
    name: displayName,
    phone: row.phone || null,
    photo: row.photo || null,
    ownerId: row.owner_id || null,
    address: row.address || null,
    specialization: row.specialization || null,
    license: row.license_number || null,
    mustChangePassword: false
  };
}

router.post('/login', asyncRoute(async (req, res) => {
  const identifier = requiredString(req.body.username || req.body.identifier, 'Username or email', 100);
  const password = requiredString(req.body.password, 'Password', 200);
  const result = await db.query(
    `SELECT u.user_id, u.username, u.role, u.email, u.phone, u.display_name,
            u.password_hash, u.account_status, o.photo,
            o.owner_id, o.name AS owner_name, o.address,
            v.veterinarian_id, v.name AS veterinarian_name, v.specialization, v.license_number
       FROM user_account u
       LEFT JOIN owner o ON o.user_id = u.user_id
       LEFT JOIN veterinarian v ON v.user_id = u.user_id
      WHERE lower(u.username) = lower($1) OR lower(u.email) = lower($1)
      LIMIT 1`,
    [identifier]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid username/email or password.' });
  }
  if (user.account_status !== 'Active') {
    return res.status(403).json({ error: 'This account has been deactivated.' });
  }

  const client = await db.connect();
  try {
    await writeAudit(client, user.user_id, 'LOGIN', 'user_account', user.user_id, 'Signed in.');
  } finally {
    client.release();
  }
  const role = ROLE_TO_UI[user.role];
  if (!role) return res.status(403).json({ error: 'This account has an unsupported role.' });
  return res.json({ token: issueToken(user), user: publicUser(user), role, name: publicUser(user).name });
}));

router.post('/register', asyncRoute(async (req, res) => {
  const name = requiredString(req.body.name, 'Name', 100);
  const email = requiredString(req.body.email, 'Email', 100).toLowerCase();
  const username = requiredString(req.body.username, 'Username', 50).toLowerCase();
  const password = requiredString(req.body.password, 'Password', 200);
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `INSERT INTO user_account
         (username, password_hash, role, email, phone, display_name)
       VALUES ($1, $2, 'Pet Owner', $3, $4, $5)
       RETURNING user_id`,
      [username, await bcrypt.hash(password, 12), email, req.body.phone || null, name]
    );
    const owner = await client.query(
      `INSERT INTO owner (user_id, name, email, phone, address)
       VALUES ($1, $2, $3, $4, $5) RETURNING owner_id`,
      [account.rows[0].user_id, name, email, req.body.phone || null, req.body.address || null]
    );
    await writeAudit(client, account.rows[0].user_id, 'INSERT', 'owner', owner.rows[0].owner_id, 'Registered a pet owner account.');
    await client.query('COMMIT');
    return res.status(201).json({ message: 'Registration successful.', userId: account.rows[0].user_id, ownerId: owner.rows[0].owner_id });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/me', authenticate, asyncRoute(async (req, res) => {
  const row = await profileFor(db, req.user.userId);
  if (!row) return notFound(res, 'Account not found.');
  return res.json({ user: publicUser(row) });
}));

router.put('/me', authenticate, asyncRoute(async (req, res) => {
  const name = requiredString(req.body.name, 'Name', 100);
  const email = req.body.email ? requiredString(req.body.email, 'Email', 100).toLowerCase() : null;
  const phone = req.body.phone == null ? null : requiredString(req.body.phone, 'Phone', 20);
  const username = req.body.username ? requiredString(req.body.username, 'Username', 50).toLowerCase() : null;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `UPDATE user_account
          SET username = COALESCE($2, username), display_name = $3,
              email = COALESCE($4, email), phone = COALESCE($5, phone)
        WHERE user_id = $1 AND account_status = 'Active'
        RETURNING user_id, role`,
      [req.user.userId, username, name, email, phone]
    );
    if (!account.rowCount) {
      await client.query('ROLLBACK');
      return notFound(res, 'Active account not found.');
    }
    if (account.rows[0].role === 'Pet Owner') {
      await client.query(
        `UPDATE owner SET name = $2, email = COALESCE($3, email), phone = COALESCE($4, phone),
                address = COALESCE($5, address), photo = COALESCE($6, photo)
          WHERE user_id = $1`,
        [req.user.userId, name, email, phone, req.body.address || null, req.body.photo || null]
      );
    } else if (account.rows[0].role === 'Veterinarian') {
      await client.query(
        `UPDATE veterinarian SET name = $2, email = COALESCE($3, email), phone = COALESCE($4, phone),
                specialization = COALESCE($5, specialization),
                license_number = COALESCE($6, license_number)
          WHERE user_id = $1`,
        [req.user.userId, name, email, phone, req.body.specialization || null, req.body.license || null]
      );
    }
    await writeAudit(client, req.user.userId, 'UPDATE', 'user_account', req.user.userId, 'Updated their profile.');
    await client.query('COMMIT');
    const user = publicUser(await profileFor(client, req.user.userId));
    return res.json({ user });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/me/password', authenticate, asyncRoute(async (req, res) => {
  const current = requiredString(req.body.current, 'Current password', 200);
  const next = requiredString(req.body.new, 'New password', 200);
  if (next.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const result = await db.query(
    `SELECT password_hash FROM user_account
      WHERE user_id = $1 AND account_status = 'Active'`,
    [req.user.userId]
  );
  if (!result.rows[0]) return notFound(res, 'Active account not found.');
  if (!(await bcrypt.compare(current, result.rows[0].password_hash))) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE user_account SET password_hash = $2 WHERE user_id = $1`,
      [req.user.userId, await bcrypt.hash(next, 12)]
    );
    await writeAudit(client, req.user.userId, 'UPDATE', 'user_account', req.user.userId, 'Changed their password.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return res.json({ message: 'Password updated.' });
}));

router.post('/logout', authenticate, asyncRoute(async (req, res) => {
  const client = await db.connect();
  try {
    await writeAudit(client, req.user.userId, 'LOGOUT', 'user_account', req.user.userId, 'Signed out.');
  } finally {
    client.release();
  }
  return res.json({ message: 'Signed out.' });
}));

module.exports = router;
