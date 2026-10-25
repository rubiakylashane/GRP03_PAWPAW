const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { requireRole } = require('../middleware/session');
const { writeAudit } = require('../services/activity');
const { normalizeUsername } = require('../utils/username');

const router = express.Router();

function clientRole(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'pet owner' || normalized === 'owner') return 'owner';
  if (normalized === 'clinic staff' || normalized === 'staff') return 'staff';
  if (normalized === 'veterinarian' || normalized === 'vet') return 'vet';
  if (normalized === 'administrator' || normalized === 'admin') return 'admin';
  return '';
}

router.get('/users', requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ua.user_id AS id, ua.username,
              COALESCE(o.name, v.name, ua.display_name, ua.username) AS name,
              ua.email, COALESCE(o.phone, v.phone) AS phone, ua.role,
              ua.account_status AS status, ua.created_date AS "createdAt",
              (o.owner_id IS NOT NULL) AS owner
       FROM user_account ua
       LEFT JOIN owner o ON o.user_id = ua.user_id
       LEFT JOIN veterinarian v ON v.user_id = ua.user_id
       ORDER BY ua.created_date DESC, ua.user_id DESC`
    );
    res.json(result.rows.map((user) => ({
      ...user,
      id: String(user.id),
      role: clientRole(user.role),
      status: String(user.status).toLowerCase()
    })));
  } catch (error) {
    console.error('Admin user list failed:', error);
    res.status(500).json({ error: 'Could not load user accounts.' });
  }
});

router.get('/audit', requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT al.action_date AS at,
              COALESCE(o.name, v.name, ua.display_name, ua.username) AS "user",
              ua.role, al.action_type AS action, al.table_name AS record,
              al.action_description AS details
       FROM audit_log al
       JOIN user_account ua ON ua.user_id = al.user_id
       LEFT JOIN owner o ON o.user_id = ua.user_id
       LEFT JOIN veterinarian v ON v.user_id = ua.user_id
       ORDER BY al.action_date DESC, al.audit_id DESC
       LIMIT 1000`
    );
    res.json(result.rows.map((entry) => ({
      ...entry,
      action: ({ INSERT: 'create', UPDATE: 'update', DELETE: 'delete' })[entry.action] || String(entry.action).toLowerCase(),
      role: clientRole(entry.role)
    })));
  } catch (error) {
    console.error('Admin audit list failed:', error);
    res.status(500).json({ error: 'Could not load the audit log.' });
  }
});

router.post('/users', requireRole('admin'), async (req, res) => {
  const { name, email, phone, password } = req.body;
  const username = normalizeUsername(req.body.username);
  const role = clientRole(req.body.role);
  if (!String(name || '').trim() || !username ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '')) ||
      !['owner', 'staff', 'admin'].includes(role) || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Enter a name, valid username and email, supported account role, and password of at least 8 characters.' });
  }
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const duplicate = await client.query(
      `SELECT EXISTS (SELECT 1 FROM user_account WHERE LOWER(username) = LOWER($1)) AS username_taken,
              EXISTS (SELECT 1 FROM user_account WHERE LOWER(email) = LOWER($2)) AS email_taken`,
      [username, email.trim()]
    );
    if (duplicate.rows[0].username_taken || duplicate.rows[0].email_taken) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: duplicate.rows[0].username_taken
          ? 'That username is already in use.'
          : 'That email address is already in use.'
      });
    }
    const result = await client.query(
      `INSERT INTO user_account
         (username, password_hash, role, email, account_status, display_name, phone)
       VALUES ($1, $2, $3, $4, 'Active', $5, $6)
       RETURNING user_id AS id, username, email, role, account_status AS status,
                 created_date AS "createdAt"`,
      [username, await bcrypt.hash(password, 10), role === 'owner' ? 'Pet Owner' : role === 'admin' ? 'Admin' : 'Staff', email.trim(), String(name).trim(), phone || null]
    );
    const user = result.rows[0];
    let ownerId = null;
    if (role === 'owner') {
      const owner = await client.query(
        `INSERT INTO owner (user_id, name, email, phone)
         VALUES ($1, $2, $3, $4) RETURNING owner_id`,
        [user.id, String(name).trim(), email.trim(), phone || null]
      );
      ownerId = owner.rows[0].owner_id;
    }
    await writeAudit(client, req.auth.userId, 'create', role === 'owner' ? 'owner' : 'user', ownerId || user.id,
      `Created ${role} account ${username}.`);
    await client.query('COMMIT');
    res.status(201).json({ user: { ...user, id: String(user.id), ownerId, name: String(name).trim(), phone, role, status: 'active' } });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (error.code === '23505') {
      const field = /username/i.test(error.constraint || '') ? 'username' : /email/i.test(error.constraint || '') ? 'email' : 'username or email';
      return res.status(409).json({ error: `That ${field} is already in use.` });
    }
    console.error('Admin user creation failed:', error);
    res.status(500).json({ error: 'Could not create the user account.' });
  } finally {
    if (client) client.release();
  }
});

router.patch('/users/:id', requireRole('admin'), async (req, res) => {
  const { status } = req.body;
  const role = req.body.role && clientRole(req.body.role);
  if (status && !['active', 'inactive'].includes(String(status).toLowerCase())) {
    return res.status(400).json({ error: 'Choose an active or inactive account status.' });
  }
  if (req.body.role && !role) return res.status(400).json({ error: 'Choose a supported account role.' });
  try {
    const currentResult = await db.query(
      `SELECT ua.user_id, ua.username, ua.role, ua.account_status,
              EXISTS (SELECT 1 FROM owner WHERE user_id = ua.user_id) AS has_owner_profile,
              EXISTS (SELECT 1 FROM veterinarian WHERE user_id = ua.user_id) AS has_vet_profile
       FROM user_account ua WHERE ua.user_id = $1`,
      [req.params.id]
    );
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ error: 'User account not found.' });
    if (String(current.user_id) === String(req.auth.userId) && String(status).toLowerCase() === 'inactive') {
      return res.status(409).json({ error: 'You cannot deactivate your own administrator account.' });
    }
    if (role && role !== clientRole(current.role) &&
        (!['staff', 'admin'].includes(role) || current.has_owner_profile || current.has_vet_profile)) {
      return res.status(409).json({ error: 'Owner and veterinarian roles require their dedicated profile forms and cannot be changed here.' });
    }
    if (!status && !role) return res.status(400).json({ error: 'No supported account changes were provided.' });
    const nextStatus = status ? (String(status).toLowerCase() === 'active' ? 'Active' : 'Inactive') : current.account_status;
    const databaseRole = role
      ? ({ owner: 'Pet Owner', staff: 'Staff', vet: 'Veterinarian', admin: 'Admin' })[role]
      : current.role;
    const result = await db.query(
      `UPDATE user_account SET role = $1, account_status = $2
       WHERE user_id = $3
       RETURNING user_id AS id, username, role, account_status AS status`,
      [databaseRole, nextStatus, req.params.id]
    );
    const auditDetails = role && role !== clientRole(current.role)
      ? `Changed the role of account ${current.username} to ${role}.`
      : `${nextStatus === 'Active' ? 'Activated' : 'Deactivated'} account ${current.username}.`;
    await writeAudit(db, req.auth.userId, 'update', 'user', req.params.id, auditDetails);
    res.json({ user: { ...result.rows[0], id: String(result.rows[0].id), role: clientRole(result.rows[0].role), status: nextStatus.toLowerCase() } });
  } catch (error) {
    console.error('Admin user update failed:', error);
    res.status(500).json({ error: 'Could not update the user account.' });
  }
});

router.post('/users/:id/reset-password', requireRole('admin'), async (req, res) => {
  const { temporaryPassword } = req.body;
  if (typeof temporaryPassword !== 'string' || temporaryPassword.length < 8) {
    return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
  }
  try {
    const result = await db.query(
      `UPDATE user_account SET password_hash = $1
       WHERE user_id = $2 RETURNING username`,
      [await bcrypt.hash(temporaryPassword, 10), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User account not found.' });
    await writeAudit(db, req.auth.userId, 'update', 'user', req.params.id,
      `Reset the password for account ${result.rows[0].username}.`);
    res.status(204).end();
  } catch (error) {
    console.error('Admin password reset failed:', error);
    res.status(500).json({ error: 'Could not reset the user password.' });
  }
});

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function veterinarianInput(body) {
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').replace(/[\s-]/g, '');
  const specialization = String(body.specialization || '').trim();
  const license = String(body.license || '').trim().toUpperCase().replace(/^PRC\s*/, '');
  if (!/^[A-Za-zÀ-ÿ.'\- ]{2,60}$/.test(name) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^(09\d{9}|\+639\d{9})$/.test(phone) ||
      !specialization || !/^\d{7}$/.test(license)) {
    return null;
  }
  return { name, email, phone, specialization, license: `PRC ${license}` };
}

router.get('/veterinarians', requireRole('admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT veterinarian_id AS id, name, specialization,
              license_number AS license, phone, email, user_id AS "userId"
       FROM veterinarian
       ORDER BY name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Admin veterinarian list failed:', error);
    res.status(500).json({ error: 'Could not load veterinarians.' });
  }
});

router.post('/veterinarians', requireRole('admin'), async (req, res) => {
  const veterinarian = veterinarianInput(req.body);
  const { password } = req.body;
  const username = normalizeUsername(req.body.username);
  if (!veterinarian || !username || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Enter valid veterinarian details, a valid username, and a password of at least 8 characters.' });
  }
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const duplicate = await client.query(
      `SELECT EXISTS (SELECT 1 FROM user_account WHERE LOWER(email) = LOWER($1)) AS email_taken,
              EXISTS (SELECT 1 FROM user_account WHERE LOWER(username) = LOWER($3)) AS username_taken,
              EXISTS (SELECT 1 FROM veterinarian WHERE license_number = $2) AS license_taken`,
      [veterinarian.email, veterinarian.license, username]
    );
    if (duplicate.rows[0].email_taken || duplicate.rows[0].license_taken || duplicate.rows[0].username_taken) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: duplicate.rows[0].username_taken
          ? 'That username is already in use.'
          : duplicate.rows[0].license_taken
            ? 'That license number is already registered.'
            : 'That email address is already in use.'
      });
    }
    const account = await client.query(
      `INSERT INTO user_account (username, password_hash, role, email, account_status, display_name, phone)
       VALUES ($1, $2, 'Veterinarian', $3, 'Active', $4, $5)
       RETURNING user_id`,
      [username, await bcrypt.hash(password, 10), veterinarian.email, veterinarian.name, veterinarian.phone]
    );
    const result = await client.query(
      `INSERT INTO veterinarian (user_id, name, specialization, license_number, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING veterinarian_id AS id, name, specialization,
                 license_number AS license, phone, email, user_id AS "userId"`,
      [account.rows[0].user_id, veterinarian.name, veterinarian.specialization,
        veterinarian.license, veterinarian.phone, veterinarian.email]
    );
    await writeAudit(client, req.auth.userId, 'create', 'veterinarian', result.rows[0].id,
      `Registered veterinarian ${veterinarian.name} (${username}).`);
    await client.query('COMMIT');
    res.status(201).json({ veterinarian: { ...result.rows[0], username } });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    if (error.code === '23505') {
      const field = /username/i.test(error.constraint || '')
        ? 'username'
        : /license/i.test(error.constraint || '')
          ? 'license number'
          : /email/i.test(error.constraint || '')
            ? 'email address'
            : 'email address or license number';
      return res.status(409).json({ error: `That ${field} is already registered.` });
    }
    console.error('Admin veterinarian creation failed:', error);
    res.status(500).json({ error: 'Could not register the veterinarian.' });
  } finally {
    if (client) client.release();
  }
});

router.put('/veterinarians/:id', requireRole('admin'), async (req, res) => {
  const veterinarian = veterinarianInput(req.body);
  if (!veterinarian) return res.status(400).json({ error: 'Enter valid veterinarian details.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT user_id FROM veterinarian WHERE veterinarian_id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Veterinarian not found.' });
    }
    const duplicate = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM user_account
         WHERE LOWER(email) = LOWER($1) AND user_id <> COALESCE($2, -1)
       ) AS email_taken,
       EXISTS (
         SELECT 1 FROM veterinarian
         WHERE license_number = $3 AND veterinarian_id <> $4
       ) AS license_taken`,
      [veterinarian.email, current.rows[0].user_id, veterinarian.license, req.params.id]
    );
    if (duplicate.rows[0].email_taken || duplicate.rows[0].license_taken) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: duplicate.rows[0].license_taken
          ? 'That license number is already registered.'
          : 'That email address is already in use.'
      });
    }
    await client.query(
      `UPDATE veterinarian
       SET name = $1, specialization = $2, license_number = $3, phone = $4, email = $5
       WHERE veterinarian_id = $6`,
      [veterinarian.name, veterinarian.specialization, veterinarian.license,
        veterinarian.phone, veterinarian.email, req.params.id]
    );
    if (current.rows[0].user_id) {
      await client.query(
        `UPDATE user_account SET display_name = $1, phone = $2, email = $3
         WHERE user_id = $4`,
        [veterinarian.name, veterinarian.phone, veterinarian.email, current.rows[0].user_id]
      );
    }
    await writeAudit(client, req.auth.userId, 'update', 'veterinarian', req.params.id,
      `Updated veterinarian ${veterinarian.name}.`);
    await client.query('COMMIT');
    res.json({ veterinarian: { ...veterinarian, id: Number(req.params.id), userId: current.rows[0].user_id } });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'That email address or license number is already registered.' });
    console.error('Admin veterinarian update failed:', error);
    res.status(500).json({ error: 'Could not update the veterinarian.' });
  } finally {
    client.release();
  }
});

router.delete('/veterinarians/:id', requireRole('admin'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT veterinarian_id, user_id, name
       FROM veterinarian WHERE veterinarian_id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Veterinarian not found.' });
    }
    const history = await client.query(
      `SELECT EXISTS (SELECT 1 FROM appointment WHERE veterinarian_id = $1)
           OR EXISTS (SELECT 1 FROM vaccination WHERE veterinarian_id = $1) AS has_history`,
      [req.params.id]
    );
    if (history.rows[0].has_history) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This veterinarian has appointment or vaccination history and cannot be deleted. Deactivate the account instead.' });
    }
    await writeAudit(client, req.auth.userId, 'delete', 'veterinarian', req.params.id,
      `Removed veterinarian ${current.rows[0].name}.`);
    await client.query('DELETE FROM veterinarian WHERE veterinarian_id = $1', [req.params.id]);
    if (current.rows[0].user_id) {
      await client.query(`UPDATE user_account SET account_status = 'Inactive' WHERE user_id = $1`, [current.rows[0].user_id]);
    }
    await client.query('COMMIT');
    res.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin veterinarian deletion failed:', error);
    res.status(500).json({ error: 'Could not remove the veterinarian.' });
  } finally {
    client.release();
  }
});

router.get('/summary', requireRole('admin'), async (req, res) => {
  try {
    const [totals, revenueByService, weekRevenue, topServices, vetsToday, unassigned, today, activity] = await Promise.all([
      db.query(
        `SELECT
           (SELECT COUNT(*)::integer FROM owner) AS owners,
           (SELECT COUNT(*)::integer FROM pet) AS pets,
           (SELECT COUNT(*)::integer FROM appointment
            WHERE appointment_date >= date_trunc('month', CURRENT_DATE)
              AND appointment_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month') AS "appointmentsThisMonth",
           (SELECT COALESCE(SUM(s.price * aps.quantity), 0)
            FROM appointment a
            JOIN appointment_service aps ON aps.appointment_id = a.appointment_id
            JOIN service s ON s.service_id = aps.service_id
            WHERE a.status = 'Completed'
              AND a.appointment_date >= date_trunc('month', CURRENT_DATE)
              AND a.appointment_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month') AS "revenueThisMonth",
           (SELECT COALESCE(SUM(s.price * aps.quantity), 0)
            FROM appointment a
            JOIN appointment_service aps ON aps.appointment_id = a.appointment_id
            JOIN service s ON s.service_id = aps.service_id
            WHERE a.status = 'Completed'
              AND a.appointment_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month'
              AND a.appointment_date < date_trunc('month', CURRENT_DATE)) AS "revenueLastMonth",
           (SELECT COUNT(*)::integer FROM appointment
            WHERE status = 'Completed'
              AND appointment_date >= date_trunc('month', CURRENT_DATE)
              AND appointment_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month') AS "completedThisMonth",
           (SELECT COUNT(*)::integer FROM appointment
            WHERE appointment_date >= date_trunc('month', CURRENT_DATE)
              AND appointment_date <= CURRENT_DATE) AS "appointmentsToDate",
           (SELECT COUNT(*)::integer FROM appointment
            WHERE status = 'Cancelled'
              AND appointment_date >= date_trunc('month', CURRENT_DATE)
              AND appointment_date <= CURRENT_DATE) AS "cancelledToDate",
           (SELECT COUNT(*)::integer FROM appointment
            WHERE status = 'No-show'
              AND appointment_date >= date_trunc('month', CURRENT_DATE)
              AND appointment_date <= CURRENT_DATE) AS "noShowToDate"`
      ),
      db.query(
        `SELECT s.service_name AS name, SUM(s.price * aps.quantity) AS amount
         FROM appointment a
         JOIN appointment_service aps ON aps.appointment_id = a.appointment_id
         JOIN service s ON s.service_id = aps.service_id
         WHERE a.status = 'Completed'
           AND a.appointment_date >= date_trunc('month', CURRENT_DATE)
           AND a.appointment_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
         GROUP BY s.service_id, s.service_name
         ORDER BY amount DESC, s.service_name`
      ),
      db.query(
        `SELECT a.appointment_date AS date, SUM(s.price * aps.quantity) AS amount
         FROM appointment a
         JOIN appointment_service aps ON aps.appointment_id = a.appointment_id
         JOIN service s ON s.service_id = aps.service_id
         WHERE a.status = 'Completed'
           AND a.appointment_date >= date_trunc('week', CURRENT_DATE)
           AND a.appointment_date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
         GROUP BY a.appointment_date`
      ),
      db.query(
        `SELECT s.service_name AS name, COUNT(*)::integer AS n
         FROM appointment a
         JOIN appointment_service aps ON aps.appointment_id = a.appointment_id
         JOIN service s ON s.service_id = aps.service_id
         WHERE a.status <> 'Cancelled'
           AND a.appointment_date >= date_trunc('week', CURRENT_DATE)
           AND a.appointment_date < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
         GROUP BY s.service_id, s.service_name
         ORDER BY n DESC, s.service_name
         LIMIT 5`
      ),
      db.query(
        `SELECT v.name, COUNT(a.appointment_id)::integer AS total,
                COUNT(a.appointment_id) FILTER (WHERE a.status = 'Completed')::integer AS done
         FROM veterinarian v
         LEFT JOIN appointment a
           ON a.veterinarian_id = v.veterinarian_id
          AND a.appointment_date = CURRENT_DATE
          AND a.status <> 'Cancelled'
         GROUP BY v.veterinarian_id, v.name
         ORDER BY v.name`
      ),
      db.query(
        `SELECT COUNT(*)::integer AS count
         FROM appointment
         WHERE appointment_date = CURRENT_DATE
           AND veterinarian_id IS NULL
           AND status <> 'Cancelled'`
      ),
      db.query(
        `SELECT a.appointment_time AS time, p.name AS pet, o.name AS owner,
                COALESCE(v.name, 'To be assigned') AS vet,
                CASE a.status
                  WHEN 'Approved' THEN 'confirmed'
                  WHEN 'Checked-in' THEN 'checked_in'
                  WHEN 'In Progress' THEN 'with_vet'
                  WHEN 'No-show' THEN 'no_show'
                  ELSE LOWER(a.status)
                END AS status
         FROM appointment a
         JOIN pet p ON p.pet_id = a.pet_id
         JOIN owner o ON o.owner_id = p.owner_id
         LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
         WHERE a.appointment_date = CURRENT_DATE
           AND a.status <> 'Cancelled'
         ORDER BY a.appointment_time
         LIMIT 10`
      ),
      db.query(
        `SELECT COALESCE(o.name, v.name, ua.username) AS actor,
                al.action_date AS at, al.action_description AS details
         FROM audit_log al
         JOIN user_account ua ON ua.user_id = al.user_id
         LEFT JOIN owner o ON o.user_id = ua.user_id
         LEFT JOIN veterinarian v ON v.user_id = ua.user_id
         ORDER BY al.action_date DESC, al.audit_id DESC
         LIMIT 5`
      )
    ]);
    const counts = totals.rows[0];
    const denominator = Number(counts.appointmentsToDate) || 0;
    const current = new Date();
    const weekStart = new Date(current.getFullYear(), current.getMonth(), current.getDate() - ((current.getDay() + 6) % 7));
    const week = Array(7).fill(0);
    weekRevenue.rows.forEach((row) => {
      const date = new Date(String(row.date).slice(0, 10) + 'T00:00:00');
      const day = Math.round((date - weekStart) / 86400000);
      if (day >= 0 && day < 7) week[day] = Number(row.amount) || 0;
    });
    res.json({
      owners: Number(counts.owners) || 0,
      pets: Number(counts.pets) || 0,
      appointmentsThisMonth: Number(counts.appointmentsThisMonth) || 0,
      revenueThisMonth: Number(counts.revenueThisMonth) || 0,
      revenueByService: revenueByService.rows.map((row) => ({ name: row.name, amount: Number(row.amount) || 0 })),
      activity: activity.rows.map((row) => ({
        text: `<strong>${escapeHtml(row.actor)}</strong> ${escapeHtml(row.details)}`,
        at: row.at
      })),
      revenueLastMonth: Number(counts.revenueLastMonth) || 0,
      completedThisMonth: Number(counts.completedThisMonth) || 0,
      cancelRate: denominator ? Math.round((Number(counts.cancelledToDate) || 0) / denominator * 100) : null,
      noShowRate: denominator ? Math.round((Number(counts.noShowToDate) || 0) / denominator * 100) : null,
      vetsToday: vetsToday.rows.map((row) => ({ name: row.name, done: row.done, total: row.total })),
      unassignedToday: Number(unassigned.rows[0].count) || 0,
      weekRevenue: week,
      topServices: topServices.rows,
      today: today.rows
    });
  } catch (error) {
    console.error('Admin summary failed:', error);
    res.status(500).json({ error: 'Could not load the clinic summary.' });
  }
});

module.exports = router;
