const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncRoute, notFound, passwordError, requiredString } = require('../utils/http');

const router = express.Router();
const UI_ROLES = {
  'Pet Owner': 'owner',
  Veterinarian: 'vet',
  Staff: 'staff',
  Admin: 'admin'
};
const DB_ROLES = Object.fromEntries(Object.entries(UI_ROLES).map(([dbRole, uiRole]) => [uiRole, dbRole]));
const APPOINTMENT_STATUS = {
  pending: 'Pending',
  confirmed: 'Approved',
  approved: 'Approved',
  scheduled: 'Scheduled',
  checked_in: 'Checked-in',
  with_vet: 'With Vet',
  in_progress: 'With Vet',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show'
};
// The schema has no service status column; keep the original description after this private prefix.
const INACTIVE_SERVICE_MARKER = '[PAWPAW-SERVICE-INACTIVE]\n';
const UI_APPOINTMENT_STATUS = {
  ...Object.fromEntries(Object.entries(APPOINTMENT_STATUS).map(([ui, dbStatus]) => [dbStatus, ui])),
  Scheduled: 'confirmed',
  Approved: 'confirmed',
  'With Vet': 'with_vet',
  'No Show': 'no_show',
  'In Progress': 'with_vet',
  'No-show': 'no_show'
};

router.use(authenticate);

function appointmentStatus(value) {
  const key = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return APPOINTMENT_STATUS[key];
}

function mapAppointment(row) {
  return {
    id: row.appointment_id,
    appointmentId: row.appointment_id,
    owner: row.owner_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    petId: row.pet_id,
    petName: row.pet_name,
    date: row.appointment_date,
    time: row.appointment_time,
    reason: row.reason || '',
    declineReason: row.cancellation_reason || '',
    rescheduleReason: row.reschedule_reason || '',
    rescheduledFrom: row.rescheduled_from_date ? { date: row.rescheduled_from_date, time: row.rescheduled_from_time } : null,
    status: UI_APPOINTMENT_STATUS[row.status] || row.status,
    vet: row.veterinarian_name || 'To be assigned',
    veterinarianId: row.veterinarian_id,
    services: row.services || [],
    total: Number(row.total || 0),
    hasRecord: row.has_record,
    createdAt: row.created_date,
    updatedAt: row.updated_date
  };
}

const APPOINTMENT_SELECT = `
  SELECT a.appointment_id, a.pet_id, p.owner_id, p.name AS pet_name,
         o.name AS owner_name, a.veterinarian_id, v.name AS veterinarian_name,
         a.appointment_date::text, to_char(a.appointment_time, 'HH24:MI') AS appointment_time,
         a.reason, a.status, a.created_date, a.updated_date,
         a.cancellation_reason, a.reschedule_reason,
         a.rescheduled_from_date::text, to_char(a.rescheduled_from_time, 'HH24:MI') AS rescheduled_from_time,
         EXISTS (SELECT 1 FROM medical_record mr WHERE mr.appointment_id = a.appointment_id) AS has_record,
         COALESCE(s.services, '[]'::json) AS services,
         COALESCE(s.total, 0) AS total
    FROM appointment a
    JOIN pet p ON p.pet_id = a.pet_id
    JOIN owner o ON o.owner_id = p.owner_id
    LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object(
               'id', sv.service_id,
               'name', sv.service_name,
               'price', sv.price,
               'quantity', aps.quantity
             ) ORDER BY sv.service_name) AS services,
             SUM(sv.price * aps.quantity) AS total
        FROM appointment_service aps
        JOIN service sv ON sv.service_id = aps.service_id
       WHERE aps.appointment_id = a.appointment_id
    ) s ON TRUE`;

async function audit(client, userId, action, table, recordId, description) {
  await client.query(
    `INSERT INTO audit_log
       (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId || null, action, table, recordId || null, description]
  );
}

async function notify(client, userId, type, title, message) {
  if (!userId) return;
  await client.query(
    `INSERT INTO notification (user_id, notification_type, title, message)
     VALUES ($1, $2, $3, $4)`,
    [userId, type, title, message]
  );
}

async function notifyStaff(client, type, title, message, excludeUserId) {
  await client.query(
    `INSERT INTO notification (user_id, notification_type, title, message)
     SELECT user_id, $1, $2, $3
       FROM user_account
      WHERE role IN ('Staff', 'Admin')
        AND account_status = 'Active'
        AND ($4::int IS NULL OR user_id <> $4)`,
    [type, title, message, excludeUserId || null]
  );
}

function validAppointmentDate(value) {
  const date = String(value || '');
  const parsed = new Date(`${date}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
    && !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === date;
}

async function getAppointments({ userId, role, ownerId, status } = {}) {
  const clauses = [];
  const values = [];
  if (role === 'vet') {
    values.push(userId);
    clauses.push(`v.user_id = $${values.length}`);
  }
  if (role === 'owner') {
    values.push(ownerId);
    clauses.push(`p.owner_id = $${values.length}`);
  }
  if (status) {
    values.push(status);
    clauses.push(`a.status = $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await db.query(
    `${APPOINTMENT_SELECT}
      ${where}
     ORDER BY a.appointment_date, a.appointment_time, a.appointment_id`,
    values
  );
  return result.rows.map(mapAppointment);
}

const VACCINATION_SELECT = `
  SELECT vx.vaccination_id AS id, p.owner_id AS owner,
         o.user_id AS owner_user_id, o.name AS "ownerName",
         COALESCE(o.phone, u.phone) AS phone,
         p.pet_id AS "petId", p.name AS pet, vx.vaccine_type AS vaccine,
         vx.date_administered::text AS "dateAdministered",
         vx.next_due_date::text AS "nextDue", vx.notes,
         COALESCE(vx.administered_by, vet.name) AS "administeredBy",
         vx.last_reminded_at AS "lastRemindedAt",
         vx.appointment_id AS "appointmentId",
         vet.user_id AS "veterinarianUserId"
    FROM vaccination vx
    JOIN pet p ON p.pet_id = vx.pet_id
    JOIN owner o ON o.owner_id = p.owner_id
    LEFT JOIN user_account u ON u.user_id = o.user_id
    LEFT JOIN veterinarian vet ON vet.veterinarian_id = vx.veterinarian_id
    LEFT JOIN appointment a ON a.appointment_id = vx.appointment_id`;

async function getVaccinations({ ownerUserId, vetUserId, remindersOnly = false } = {}) {
  const clauses = [];
  const values = [];
  if (ownerUserId) {
    values.push(ownerUserId);
    clauses.push(`o.user_id = $${values.length}`);
  }
  if (vetUserId) {
    values.push(vetUserId);
    clauses.push(`(vet.user_id = $${values.length} OR a.veterinarian_id = (
      SELECT veterinarian_id FROM veterinarian WHERE user_id = $${values.length}
    ))`);
  }
  if (remindersOnly) clauses.push('vx.next_due_date IS NOT NULL');
  const result = await db.query(
    `${VACCINATION_SELECT}
      ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY vx.next_due_date NULLS LAST, vx.date_administered DESC, vx.vaccination_id DESC`,
    values
  );
  return result.rows;
}

router.get('/me', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT user_id, role FROM user_account
      WHERE user_id = $1 AND account_status = 'Active'`,
    [req.user.userId]
  );
  if (!result.rows[0]) return notFound(res, 'Account not found.');
  return res.json({ userId: result.rows[0].user_id, role: UI_ROLES[result.rows[0].role] });
}));

router.get('/admin/users', authorize('Admin'), asyncRoute(async (req, res) => {
  const role = req.query.role ? DB_ROLES[String(req.query.role).toLowerCase()] : null;
  const result = await db.query(
    `SELECT u.user_id AS id, u.user_id, u.username, u.display_name AS name, u.email, u.phone,
            u.role, u.account_status, u.created_date,
            o.owner_id, o.address, o.registration_date,
            v.veterinarian_id, v.specialization, v.license_number
       FROM user_account u
       LEFT JOIN owner o ON o.user_id = u.user_id
       LEFT JOIN veterinarian v ON v.user_id = u.user_id
      WHERE ($1::text IS NULL OR u.role = $1)
      ORDER BY u.created_date DESC, u.user_id DESC`,
    [role]
  );
  return res.json(result.rows.map((row) => ({
    ...row,
    role: UI_ROLES[row.role],
    status: row.account_status.toLowerCase(),
    createdAt: row.created_date,
    mustChange: false
  })));
}));

router.post('/admin/users', authorize('Admin'), asyncRoute(async (req, res) => {
  const name = requiredString(req.body.name, 'Name', 100);
  const email = requiredString(req.body.email, 'Email', 100).toLowerCase();
  const role = DB_ROLES[String(req.body.role || '').toLowerCase()];
  const password = requiredString(req.body.password || req.body.temporaryPassword, 'Temporary password', 200);
  if (!role || role === 'Veterinarian') return res.status(400).json({ error: 'Choose Owner, Staff, or Admin. Add veterinarians from the Veterinarians page.' });
  const passwordIssue = passwordError(password, 'Temporary password');
  if (passwordIssue) return res.status(400).json({ error: passwordIssue });
  const username = (req.body.username || name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')).slice(0, 50);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `INSERT INTO user_account
         (username, password_hash, role, email, phone, display_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, username, role, email, phone, display_name, account_status, created_date`,
      [username, await bcrypt.hash(password, 12), role, email, req.body.phone || null, name]
    );
    if (role === 'Pet Owner') {
      await client.query(
        `INSERT INTO owner (user_id, name, email, phone, address)
         VALUES ($1, $2, $3, $4, $5)`,
        [account.rows[0].user_id, name, email, req.body.phone || null, req.body.address || null]
      );
    }
    await audit(client, req.user.userId, 'INSERT', 'user_account', account.rows[0].user_id, `Created ${role} account ${username}.`);
    await client.query('COMMIT');
    return res.status(201).json({ ...account.rows[0], role: UI_ROLES[role], status: 'active', createdAt: account.rows[0].created_date });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/admin/users/:id', authorize('Admin'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid user ID.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT user_id, role, account_status FROM user_account
        WHERE user_id = $1 FOR UPDATE`,
      [id]
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return notFound(res, 'User not found.');
    }
    const before = current.rows[0];
    if (req.body.status !== undefined && !['active', 'inactive'].includes(String(req.body.status).toLowerCase())) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Status must be active or inactive.' });
    }
    const role = req.body.role === undefined ? before.role : DB_ROLES[String(req.body.role).toLowerCase()];
    const status = req.body.status === undefined ? before.account_status : String(req.body.status).toLowerCase() === 'active' ? 'Active' : 'Inactive';
    if (!role) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid user role.' });
    }
    if (id === req.user.userId && status !== 'Active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }
    if (before.role === 'Admin' && role !== 'Admin' && before.account_status === 'Active') {
      const activeAdmins = await client.query(
        `SELECT count(*)::int AS count FROM user_account
          WHERE role = 'Admin' AND account_status = 'Active' AND user_id <> $1`,
        [id]
      );
      if (activeAdmins.rows[0].count < 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The only active administrator cannot be demoted.' });
      }
    }
    if (before.role === 'Admin' && status !== 'Active' && before.account_status === 'Active') {
      const activeAdmins = await client.query(
        `SELECT count(*)::int AS count FROM user_account
          WHERE role = 'Admin' AND account_status = 'Active' AND user_id <> $1`,
        [id]
      );
      if (activeAdmins.rows[0].count < 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'The only active administrator cannot be deactivated.' });
      }
    }
    const result = await client.query(
      `UPDATE user_account
          SET role = $2, account_status = $3,
              display_name = COALESCE($4, display_name),
              email = COALESCE($5, email),
              phone = COALESCE($6, phone)
        WHERE user_id = $1
        RETURNING user_id AS id, username, role, account_status, display_name AS name, email, phone, created_date`,
      [id, role, status, req.body.name || null, req.body.email || null, req.body.phone || null]
    );
    if (role === 'Pet Owner') {
      await client.query(
        `UPDATE owner SET name = COALESCE($2, name), email = COALESCE($3, email),
                phone = COALESCE($4, phone)
          WHERE user_id = $1`,
        [id, req.body.name || null, req.body.email || null, req.body.phone || null]
      );
      await client.query(
        `INSERT INTO owner (user_id, name, email, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO NOTHING`,
        [id, req.body.name || result.rows[0].name || result.rows[0].username, req.body.email || result.rows[0].email, req.body.phone || result.rows[0].phone]
      );
    } else if (role === 'Veterinarian') {
      await client.query(
        `UPDATE veterinarian SET name = COALESCE($2, name), email = COALESCE($3, email),
                phone = COALESCE($4, phone)
          WHERE user_id = $1`,
        [id, req.body.name || null, req.body.email || null, req.body.phone || null]
      );
      await client.query(
        `INSERT INTO veterinarian (user_id, name, email, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO NOTHING`,
        [id, req.body.name || result.rows[0].name || result.rows[0].username, req.body.email || result.rows[0].email, req.body.phone || result.rows[0].phone]
      );
    }
    await audit(client, req.user.userId, 'UPDATE', 'user_account', id, `Updated account ${result.rows[0].username}.`);
    await client.query('COMMIT');
    return res.json({ ...result.rows[0], role: UI_ROLES[role], status: status.toLowerCase(), createdAt: result.rows[0].created_date });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/admin/users/:id/reset-password', authorize('Admin'), asyncRoute(async (req, res) => {
  const password = requiredString(req.body.temporaryPassword || req.body.password, 'Temporary password', 200);
  const passwordIssue = passwordError(password, 'Temporary password');
  if (passwordIssue) return res.status(400).json({ error: passwordIssue });
  const result = await db.query(
    `UPDATE user_account
        SET password_hash = $2
      WHERE user_id = $1
      RETURNING user_id, username`,
    [req.params.id, await bcrypt.hash(password, 12)]
  );
  if (!result.rows[0]) return notFound(res, 'User not found.');
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'UPDATE', 'user_account', $2, $3)`,
    [req.user.userId, result.rows[0].user_id, `Reset password for ${result.rows[0].username}.`]
  );
  return res.json({ message: 'Password updated.' });
}));

router.get('/admin/veterinarians', authorize('Admin'), asyncRoute(async (_req, res) => {
  const result = await db.query(
    `SELECT v.veterinarian_id AS id, v.veterinarian_id, v.user_id AS "userId",
            v.name, v.specialization, v.license_number AS license, v.phone, v.email,
            u.username, u.account_status
       FROM veterinarian v
       LEFT JOIN user_account u ON u.user_id = v.user_id
      ORDER BY v.name`
  );
  return res.json(result.rows.map((v) => ({ ...v, status: (v.account_status || 'Active').toLowerCase() })));
}));

router.get(['/veterinarians', '/vets'], authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (_req, res) => {
  const result = await db.query(
    `SELECT v.veterinarian_id AS id, v.veterinarian_id, v.user_id AS "userId",
            v.name, v.specialization, v.license_number AS license, v.phone, v.email,
            u.username, u.account_status
       FROM veterinarian v
       JOIN user_account u ON u.user_id = v.user_id
      WHERE u.role = 'Veterinarian' AND u.account_status = 'Active'
      ORDER BY v.name`
  );
  return res.json(result.rows.map((v) => ({ ...v, status: 'active' })));
}));

router.post('/admin/veterinarians', authorize('Admin'), asyncRoute(async (req, res) => {
  const name = requiredString(req.body.name, 'Name', 100);
  const email = requiredString(req.body.email, 'Email', 100).toLowerCase();
  const license = requiredString(req.body.license || req.body.license_number, 'License number', 50);
  const password = requiredString(req.body.password || req.body.temporaryPassword, 'Temporary password', 200);
  const passwordIssue = passwordError(password, 'Temporary password');
  if (passwordIssue) return res.status(400).json({ error: passwordIssue });
  const username = (req.body.username || name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')).slice(0, 50);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `INSERT INTO user_account
         (username, password_hash, role, email, phone, display_name)
       VALUES ($1, $2, 'Veterinarian', $3, $4, $5)
       RETURNING user_id`,
      [username, await bcrypt.hash(password, 12), email, req.body.phone || null, name]
    );
    const vet = await client.query(
      `INSERT INTO veterinarian (user_id, name, specialization, phone, email, license_number)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING veterinarian_id AS id, veterinarian_id, user_id AS "userId", name, specialization,
                 phone, email, license_number AS license`,
      [account.rows[0].user_id, name, req.body.specialization || null, req.body.phone || null, email, license]
    );
    await audit(client, req.user.userId, 'INSERT', 'veterinarian', vet.rows[0].id, `Added veterinarian ${name}.`);
    await client.query('COMMIT');
    return res.status(201).json({ ...vet.rows[0], username, status: 'active' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/admin/veterinarians/:id', authorize('Admin'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid veterinarian ID.' });
  const result = await db.query(
    `UPDATE veterinarian
        SET name = COALESCE($2, name), specialization = COALESCE($3, specialization),
            phone = COALESCE($4, phone), email = COALESCE($5, email),
            license_number = COALESCE($6, license_number)
      WHERE veterinarian_id = $1
      RETURNING veterinarian_id AS id, veterinarian_id, user_id AS "userId", name, specialization,
                phone, email, license_number AS license`,
    [id, req.body.name || null, req.body.specialization || null, req.body.phone || null, req.body.email || null, req.body.license || null]
  );
  if (!result.rows[0]) return notFound(res, 'Veterinarian not found.');
  if (result.rows[0].userId) {
    await db.query(
      `UPDATE user_account SET display_name = $2, email = $3, phone = $4
        WHERE user_id = $1`,
      [result.rows[0].userId, result.rows[0].name, result.rows[0].email, result.rows[0].phone]
    );
  }
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'UPDATE', 'veterinarian', $2, $3)`,
    [req.user.userId, id, `Updated veterinarian ${result.rows[0].name}.`]
  );
  return res.json(result.rows[0]);
}));

router.patch('/admin/veterinarians/:id/status', authorize('Admin'), asyncRoute(async (req, res) => {
  const requestedStatus = String(req.body.status || '').toLowerCase();
  if (!['active', 'inactive'].includes(requestedStatus)) return res.status(400).json({ error: 'Status must be active or inactive.' });
  const active = requestedStatus === 'active';
  const result = await db.query(
    `UPDATE user_account u
        SET account_status = $2
       FROM veterinarian v
      WHERE v.veterinarian_id = $1 AND v.user_id = u.user_id
      RETURNING v.veterinarian_id, v.name`,
    [req.params.id, active ? 'Active' : 'Inactive']
  );
  if (!result.rows[0]) return notFound(res, 'Veterinarian login account not found.');
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'UPDATE', 'veterinarian', $2, $3)`,
    [req.user.userId, result.rows[0].veterinarian_id, `${active ? 'Activated' : 'Deactivated'} veterinarian ${result.rows[0].name}.`]
  );
  return res.json({ status: active ? 'active' : 'inactive' });
}));

router.get('/owners', authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (req, res) => {
  const values = [];
  let where = '';
  if (req.user.role === 'Pet Owner') {
    values.push(req.user.userId);
    where = 'WHERE o.user_id = $1';
  }
  const owners = await db.query(
    `SELECT o.owner_id AS id, o.owner_id, o.user_id, o.name, o.email, o.phone, o.address,
            o.registration_date, o.photo AS profile_photo,
            COALESCE(u.account_status, 'Active') AS account_status
       FROM owner o
       LEFT JOIN user_account u ON u.user_id = o.user_id
       ${where}
      ORDER BY o.name`,
    values
  );
  const pets = await db.query(
    `SELECT p.pet_id AS id, p.pet_id, p.owner_id, p.name, p.species, p.breed,
            p.date_of_birth, p.gender, p.allergies, p.notes, p.photo,
            p.pet_status = 'Active' AS is_active, lower(p.pet_status) AS status
       FROM pet p
       JOIN owner o ON o.owner_id = p.owner_id
       ${where}
      ORDER BY p.name`,
    values
  );
  const grouped = new Map();
  for (const pet of pets.rows) {
    if (!grouped.has(pet.owner_id)) grouped.set(pet.owner_id, []);
    grouped.get(pet.owner_id).push(pet);
  }
  return res.json(owners.rows.map((owner) => ({ ...owner, pets: grouped.get(owner.id) || [] })));
}));

router.post('/owners', authorize('Admin', 'Staff'), asyncRoute(async (req, res) => {
  const name = requiredString(req.body.name, 'Name', 100);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO owner (name, email, phone, address)
       VALUES ($1, $2, $3, $4)
       RETURNING owner_id AS id, owner_id, name, email, phone, address, registration_date`,
      [name, req.body.email || null, req.body.phone || null, req.body.address || null]
    );
    await audit(client, req.user.userId, 'INSERT', 'owner', result.rows[0].id, `Registered owner ${name}.`);
    await client.query('COMMIT');
    return res.status(201).json({ ...result.rows[0], pets: [] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/owners/:id', authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === 'Pet Owner') {
    const own = await db.query('SELECT owner_id FROM owner WHERE user_id = $1', [req.user.userId]);
    if (!own.rows[0] || own.rows[0].owner_id !== id) return res.status(403).json({ error: 'You can only view your own profile.' });
  }
  const result = await db.query(
    `SELECT o.owner_id AS id, o.owner_id, o.user_id, o.name, o.email, o.phone, o.address,
            o.registration_date, o.photo AS profile_photo,
            COALESCE(u.account_status, 'Active') AS account_status
       FROM owner o LEFT JOIN user_account u ON u.user_id = o.user_id
      WHERE o.owner_id = $1`,
    [id]
  );
  if (!result.rows[0]) return notFound(res, 'Owner not found.');
  const pets = await db.query(
    `SELECT pet_id AS id, pet_id, owner_id, name, species, breed, date_of_birth,
            gender, allergies, notes, photo, pet_status = 'Active' AS is_active,
            lower(pet_status) AS status
       FROM pet WHERE owner_id = $1 ORDER BY name`,
    [id]
  );
  return res.json({ ...result.rows[0], pets: pets.rows });
}));

router.patch('/owners/:id', authorize('Admin', 'Staff', 'Pet Owner'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid owner ID.' });

  const fields = ['name', 'email', 'phone', 'address', 'photo'];
  const provided = Object.fromEntries(fields.map((field) => [field, Object.prototype.hasOwnProperty.call(req.body, field)]));
  const values = {
    name: provided.name ? requiredString(req.body.name, 'Name', 100) : null,
    email: provided.email ? (String(req.body.email || '').trim().toLowerCase() || null) : null,
    phone: provided.phone ? (String(req.body.phone || '').trim() || null) : null,
    address: provided.address ? (String(req.body.address || '').trim() || null) : null,
    photo: provided.photo ? (String(req.body.photo || '').trim() || null) : null
  };
  const currentPassword = req.body.currentPassword === undefined ? null : requiredString(req.body.currentPassword, 'Current password', 200);
  const newPassword = req.body.newPassword === undefined ? null : requiredString(req.body.newPassword, 'New password', 200);
  if ((currentPassword === null) !== (newPassword === null)) {
    return res.status(400).json({ error: 'Current and new passwords are both required.' });
  }
  const passwordIssue = newPassword === null ? null : passwordError(newPassword);
  if (passwordIssue) {
    return res.status(400).json({ error: passwordIssue });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const owner = await client.query(
      `SELECT owner_id, user_id FROM owner WHERE owner_id = $1 FOR UPDATE`,
      [id]
    );
    if (!owner.rows[0]) {
      await client.query('ROLLBACK');
      return notFound(res, 'Owner not found.');
    }
    if (req.user.role === 'Pet Owner' && owner.rows[0].user_id !== req.user.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only update your own profile.' });
    }
    if (newPassword !== null) {
      const actor = await client.query(
        `SELECT password_hash FROM user_account
          WHERE user_id = $1 AND account_status = 'Active'`,
        [req.user.userId]
      );
      if (!actor.rows[0] || !(await bcrypt.compare(currentPassword, actor.rows[0].password_hash))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      if (!owner.rows[0].user_id) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This owner has no login account.' });
      }
      const target = await client.query(
        `SELECT role FROM user_account WHERE user_id = $1 FOR UPDATE`,
        [owner.rows[0].user_id]
      );
      if (!target.rows[0] || target.rows[0].role !== 'Pet Owner') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This owner has no owner login account.' });
      }
      await client.query(
        `UPDATE user_account SET password_hash = $2 WHERE user_id = $1`,
        [owner.rows[0].user_id, await bcrypt.hash(newPassword, 12)]
      );
      await audit(client, req.user.userId, 'UPDATE', 'user_account', owner.rows[0].user_id, `Changed password for owner ${id}.`);
    }

    const result = await client.query(
      `UPDATE owner
          SET name = CASE WHEN $2::boolean THEN $3 ELSE name END,
              email = CASE WHEN $4::boolean THEN $5 ELSE email END,
              phone = CASE WHEN $6::boolean THEN $7 ELSE phone END,
              address = CASE WHEN $8::boolean THEN $9 ELSE address END,
              photo = CASE WHEN $10::boolean THEN $11 ELSE photo END
        WHERE owner_id = $1
        RETURNING owner_id AS id, owner_id, user_id, name, email, phone, address,
                  registration_date, photo AS profile_photo`,
      [
        id,
        provided.name, values.name,
        provided.email, values.email,
        provided.phone, values.phone,
        provided.address, values.address,
        provided.photo, values.photo
      ]
    );
    if (result.rows[0].user_id) {
      await client.query(
        `UPDATE user_account
            SET display_name = $2,
                email = CASE WHEN $3::boolean THEN $4 ELSE email END,
                phone = CASE WHEN $5::boolean THEN $6 ELSE phone END
          WHERE user_id = $1`,
        [result.rows[0].user_id, result.rows[0].name, provided.email, values.email, provided.phone, values.phone]
      );
    }
    await audit(client, req.user.userId, 'UPDATE', 'owner', id, `Updated owner ${result.rows[0].name}.`);
    await client.query('COMMIT');
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/owners/:id/status', authorize('Admin'), asyncRoute(async (req, res) => {
  const requestedStatus = String(req.body.status || '').toLowerCase();
  if (!['active', 'inactive'].includes(requestedStatus)) return res.status(400).json({ error: 'Status must be active or inactive.' });
  const active = requestedStatus === 'active';
  const owner = await db.query('SELECT owner_id, user_id FROM owner WHERE owner_id = $1', [req.params.id]);
  if (!owner.rows[0]) return notFound(res, 'Owner not found.');
  if (!owner.rows[0].user_id) return res.status(409).json({ error: 'This owner has no login account; the schema has no owner status field.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE user_account SET account_status = $2 WHERE user_id = $1',
      [owner.rows[0].user_id, active ? 'Active' : 'Inactive']
    );
    await audit(client, req.user.userId, 'UPDATE', 'owner', owner.rows[0].owner_id, `${active ? 'Activated' : 'Deactivated'} owner account.`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return res.json({ status: active ? 'active' : 'inactive' });
}));

router.post('/owners/:id/pets', authorize('Admin', 'Staff', 'Pet Owner'), asyncRoute(async (req, res) => {
  const ownerId = Number(req.params.id);
  if (!Number.isInteger(ownerId) || ownerId < 1) return res.status(400).json({ error: 'Invalid owner ID.' });
  if (req.user.role === 'Pet Owner') {
    const owner = await db.query('SELECT owner_id FROM owner WHERE user_id = $1', [req.user.userId]);
    if (!owner.rows[0] || owner.rows[0].owner_id !== ownerId) return res.status(403).json({ error: 'You can only add pets to your own account.' });
  }
  const name = requiredString(req.body.name, 'Pet name', 100);
  const species = requiredString(req.body.species, 'Species', 50);
  const breed = req.body.breed == null || req.body.breed === '' ? null : requiredString(req.body.breed, 'Breed', 50);
  const gender = req.body.gender == null || req.body.gender === '' ? null : requiredString(req.body.gender, 'Gender', 10);
  if (gender && !['Male', 'Female', 'Unknown'].includes(gender)) {
    return res.status(400).json({ error: 'Gender must be Male, Female, or Unknown.' });
  }
  const dateOfBirth = req.body.dateOfBirth || null;
  if (dateOfBirth !== null && !validAppointmentDate(String(dateOfBirth))) {
    return res.status(400).json({ error: 'Date of birth must be a valid YYYY-MM-DD date.' });
  }
  if (dateOfBirth) {
    const currentDate = await db.query('SELECT CURRENT_DATE::text AS today');
    if (dateOfBirth > currentDate.rows[0].today) {
      return res.status(400).json({ error: 'Date of birth cannot be in the future.' });
    }
  }
  const result = await db.query(
    `INSERT INTO pet
       (owner_id, name, species, breed, date_of_birth, gender, allergies, notes, photo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING pet_id AS id, pet_id, owner_id, name, species, breed, date_of_birth, gender, allergies, notes, photo, pet_status = 'Active' AS is_active, lower(pet_status) AS status`,
    [ownerId, name, species, breed, dateOfBirth, gender, req.body.allergies || null, req.body.notes || null, req.body.photo || null]
  );
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'INSERT', 'pet', $2, $3)`,
    [req.user.userId, result.rows[0].id, `Added pet ${name}.`]
  );
  return res.status(201).json(result.rows[0]);
}));

router.patch('/owners/:ownerId/pets/:petId', authorize('Admin', 'Staff', 'Pet Owner'), asyncRoute(async (req, res) => {
  const ownerId = Number(req.params.ownerId);
  const petId = Number(req.params.petId);
  if (!Number.isInteger(ownerId) || ownerId < 1 || !Number.isInteger(petId) || petId < 1) {
    return res.status(400).json({ error: 'Invalid owner or pet ID.' });
  }
  if (req.user.role === 'Pet Owner') {
    const owner = await db.query('SELECT owner_id FROM owner WHERE user_id = $1', [req.user.userId]);
    if (!owner.rows[0] || owner.rows[0].owner_id !== ownerId) return res.status(403).json({ error: 'You can only update your own pets.' });
  }
  if (req.body.status !== undefined && !['active', 'inactive'].includes(String(req.body.status).toLowerCase())) {
    return res.status(400).json({ error: 'Status must be active or inactive.' });
  }
  if (req.body.gender !== undefined && req.body.gender !== null
      && !['Male', 'Female', 'Unknown'].includes(String(req.body.gender))) {
    return res.status(400).json({ error: 'Gender must be Male, Female, or Unknown.' });
  }
  const hasDateOfBirth = Object.prototype.hasOwnProperty.call(req.body, 'dateOfBirth');
  const dateOfBirth = req.body.dateOfBirth || null;
  if (dateOfBirth && !validAppointmentDate(String(dateOfBirth))) {
    return res.status(400).json({ error: 'Date of birth must be a valid YYYY-MM-DD date.' });
  }
  if (dateOfBirth) {
    const currentDate = await db.query('SELECT CURRENT_DATE::text AS today');
    if (dateOfBirth > currentDate.rows[0].today) {
      return res.status(400).json({ error: 'Date of birth cannot be in the future.' });
    }
  }
  const result = await db.query(
    `UPDATE pet
        SET name = COALESCE($3, name), species = COALESCE($4, species),
            breed = COALESCE($5, breed),
            date_of_birth = CASE WHEN $12::boolean THEN $6::date ELSE date_of_birth END,
            gender = COALESCE($7, gender), allergies = COALESCE($8, allergies),
            notes = COALESCE($9, notes), photo = COALESCE($10, photo),
            pet_status = CASE WHEN $11::text IS NULL THEN pet_status
                              WHEN lower($11) = 'inactive' THEN 'Inactive' ELSE 'Active' END
      WHERE owner_id = $1 AND pet_id = $2
      RETURNING pet_id AS id, pet_id, owner_id, name, species, breed, date_of_birth, gender, allergies, notes, photo, pet_status = 'Active' AS is_active, lower(pet_status) AS status`,
    [
      ownerId, petId,
      req.body.name || null, req.body.species || null, req.body.breed || null,
      dateOfBirth, req.body.gender || null, req.body.allergies || null,
      req.body.notes || null, req.body.photo || null,
      req.body.status === undefined ? null : String(req.body.status), hasDateOfBirth
    ]
  );
  if (!result.rows[0]) return notFound(res, 'Pet not found.');
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'UPDATE', 'pet', $2, $3)`,
    [req.user.userId, petId, `Updated pet ${result.rows[0].name}.`]
  );
  return res.json(result.rows[0]);
}));

router.get('/services', asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT service_id AS id, service_name AS name, price,
            CASE WHEN description LIKE $1 THEN substring(description FROM $2) ELSE description END AS "desc",
            CASE WHEN description LIKE $1 THEN FALSE ELSE TRUE END AS is_active,
            CASE WHEN description LIKE $1 THEN 'inactive' ELSE 'active' END AS status
       FROM service
      WHERE $3::boolean OR description IS NULL OR description NOT LIKE $1
      ORDER BY service_name`,
    [INACTIVE_SERVICE_MARKER + '%', INACTIVE_SERVICE_MARKER.length + 1, req.user.role === 'Admin']
  );
  const services = result.rows.map((service) => ({
    ...service,
    price: Number(service.price)
  }));
  if (req.user.role !== 'Pet Owner') return res.json(services);

  const vaccineServices = services.filter((service) => service.name.startsWith('Vaccine: '));
  const visibleServices = services.filter((service) => !service.name.startsWith('Vaccine: '));
  if (vaccineServices.length) {
    visibleServices.push({
      id: 'vaccination',
      name: 'Vaccination',
      price: Math.min(...vaccineServices.map((service) => service.price)),
      desc: "Core and booster vaccines, recorded in your pet's history with the next due date.",
      options: vaccineServices.map((service) => ({
        id: service.id,
        name: service.name.slice('Vaccine: '.length),
        price: service.price
      }))
    });
  }
  return res.json(visibleServices);
}));

router.post(['/services', '/admin/services'], authorize('Admin'), asyncRoute(async (req, res) => {
  const name = requiredString(req.body.name, 'Service name', 100);
  const price = Number(req.body.price);
  if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Price must be a non-negative number.' });
  const result = await db.query(
    `INSERT INTO service (service_name, price, description)
     VALUES ($1, $2, $3)
     RETURNING service_id AS id, service_name AS name, price, description AS "desc"`,
    [name, price, req.body.desc || req.body.description || null]
  );
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'INSERT', 'service', $2, $3)`,
    [req.user.userId, result.rows[0].id, `Added service ${name}.`]
  );
  return res.status(201).json({ ...result.rows[0], is_active: true, status: 'active' });
}));

router.patch(['/services/:id', '/admin/services/:id'], authorize('Admin'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid service ID.' });
  if (req.body.status !== undefined && !['active', 'inactive'].includes(String(req.body.status).toLowerCase())) {
    return res.status(400).json({ error: 'Status must be active or inactive.' });
  }
  const price = req.body.price === undefined ? null : Number(req.body.price);
  if (price !== null && (!Number.isFinite(price) || price < 0)) return res.status(400).json({ error: 'Price must be a non-negative number.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT service_name, description FROM service WHERE service_id = $1 FOR UPDATE',
      [id]
    );
    if (!current.rows[0]) {
      await client.query('ROLLBACK');
      return notFound(res, 'Service not found.');
    }
    const before = current.rows[0];
    const wasInactive = String(before.description || '').startsWith(INACTIVE_SERVICE_MARKER);
    const description = req.body.desc !== undefined || req.body.description !== undefined
      ? String(req.body.desc ?? req.body.description ?? '')
      : wasInactive ? before.description.slice(INACTIVE_SERVICE_MARKER.length) : before.description;
    const inactive = req.body.status === undefined ? wasInactive : String(req.body.status).toLowerCase() === 'inactive';
    const storedDescription = inactive ? INACTIVE_SERVICE_MARKER + (description || '') : description || null;
    const result = await client.query(
      `UPDATE service
          SET service_name = COALESCE($2, service_name), price = COALESCE($3, price),
              description = $4
        WHERE service_id = $1
        RETURNING service_id AS id, service_name AS name, price, description`,
      [id, req.body.name || null, price, storedDescription]
    );
    await audit(client, req.user.userId, 'UPDATE', 'service', id,
      `${inactive && !wasInactive ? 'Deactivated' : !inactive && wasInactive ? 'Activated' : 'Updated'} service ${result.rows[0].name}.`);
    await client.query('COMMIT');
    const row = result.rows[0];
    return res.json({
      id: row.id, name: row.name, price: row.price,
      desc: inactive ? String(row.description || '').slice(INACTIVE_SERVICE_MARKER.length) : row.description,
      is_active: !inactive, status: inactive ? 'inactive' : 'active'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/admin/appointments', authorize('Admin', 'Staff'), asyncRoute(async (req, res) => {
  const status = req.query.status ? appointmentStatus(req.query.status) : null;
  if (req.query.status && !status) return res.status(400).json({ error: 'Invalid appointment status filter.' });
  return res.json(await getAppointments({ status }));
}));

router.get('/staff/appointments', authorize('Admin', 'Staff'), asyncRoute(async (_req, res) => {
  return res.json(await getAppointments());
}));

router.get('/vet/appointments', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  return res.json(await getAppointments({ role: 'vet', userId: req.user.userId }));
}));

router.get('/appointments', authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (req, res) => {
  if (req.user.role === 'Veterinarian') return res.json(await getAppointments({ role: 'vet', userId: req.user.userId }));
  if (req.user.role === 'Pet Owner') {
    const owner = await db.query('SELECT owner_id FROM owner WHERE user_id = $1', [req.user.userId]);
    return res.json(await getAppointments({ role: 'owner', ownerId: owner.rows[0]?.owner_id }));
  }
  return res.json(await getAppointments());
}));

router.get('/owner/vaccinations/overdue', authorize('Pet Owner'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `WITH latest_vaccinations AS (
       SELECT DISTINCT ON (v.pet_id, v.vaccine_type)
              p.name AS pet, p.photo, v.vaccine_type, v.next_due_date
         FROM vaccination v
         JOIN pet p ON p.pet_id = v.pet_id
         JOIN owner o ON o.owner_id = p.owner_id
        WHERE o.user_id = $1
        ORDER BY v.pet_id, v.vaccine_type, v.date_administered DESC, v.vaccination_id DESC
     )
     SELECT pet, photo, vaccine_type, next_due_date
       FROM latest_vaccinations
      WHERE next_due_date < CURRENT_DATE
      ORDER BY next_due_date, pet, vaccine_type`,
    [req.user.userId]
  );
  return res.json(result.rows.map((row) => ({
    pet: row.pet,
    photo: row.photo || '',
    vaccine: row.vaccine_type,
    nextDue: row.next_due_date
  })));
}));

router.get('/staff/vaccinations', authorize('Admin', 'Staff'), asyncRoute(async (_req, res) => {
  return res.json(await getVaccinations());
}));

router.get('/vet/vaccinations', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  return res.json(await getVaccinations({ vetUserId: req.user.userId }));
}));

router.get('/vaccinations', authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (req, res) => {
  if (req.user.role === 'Pet Owner') return res.json(await getVaccinations({ ownerUserId: req.user.userId }));
  if (req.user.role === 'Veterinarian') return res.json(await getVaccinations({ vetUserId: req.user.userId }));
  return res.json(await getVaccinations());
}));

router.get('/staff/vaccination-reminders', authorize('Admin', 'Staff'), asyncRoute(async (_req, res) => {
  return res.json(await getVaccinations({ remindersOnly: true }));
}));

router.post('/vaccinations', authorize('Admin', 'Staff', 'Veterinarian'), asyncRoute(async (req, res) => {
  const petId = validId(req.body.petId);
  if (!petId) return res.status(400).json({ error: 'Choose a valid pet.' });
  const vaccine = requiredString(req.body.vaccine, 'Vaccine name', 100);
  const date = requiredString(req.body.dateAdministered, 'Date administered', 10);
  if (!validAppointmentDate(date)) return res.status(400).json({ error: 'Date administered must be a valid YYYY-MM-DD date.' });
  const nextDue = req.body.nextDue == null || req.body.nextDue === ''
    ? null
    : requiredString(req.body.nextDue, 'Next due date', 10);
  if (nextDue && (!validAppointmentDate(nextDue) || nextDue < date)) {
    return res.status(400).json({ error: 'Next due date must be a valid date on or after the date administered.' });
  }
  const appointmentId = req.body.appointmentId == null || req.body.appointmentId === ''
    ? null
    : validId(req.body.appointmentId);
  if (req.body.appointmentId != null && req.body.appointmentId !== '' && !appointmentId) {
    return res.status(400).json({ error: 'Invalid appointment ID.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const pet = await client.query(
      `SELECT p.owner_id, p.name AS pet, o.user_id AS owner_user_id
         FROM pet p JOIN owner o ON o.owner_id = p.owner_id
        WHERE p.pet_id = $1 AND p.pet_status = 'Active'`,
      [petId]
    );
    if (!pet.rows[0]) {
      await client.query('ROLLBACK');
      return notFound(res, 'Active pet not found.');
    }

    let veterinarianId = null;
    let administeredBy = null;
    if (req.user.role === 'Veterinarian') {
      const vet = await client.query(
        `SELECT veterinarian_id, name FROM veterinarian WHERE user_id = $1`,
        [req.user.userId]
      );
      if (!vet.rows[0]) {
        await client.query('ROLLBACK');
        return notFound(res, 'Veterinarian profile not found.');
      }
      veterinarianId = vet.rows[0].veterinarian_id;
      administeredBy = vet.rows[0].name;
      const assigned = await client.query(
        `SELECT 1 FROM appointment
          WHERE pet_id = $1 AND veterinarian_id = $2
            AND ($3::int IS NULL OR appointment_id = $3)
          LIMIT 1`,
        [petId, veterinarianId, appointmentId]
      );
      if (!assigned.rowCount) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You may only record a vaccination for a pet assigned to you.' });
      }
    } else {
      const user = await client.query(
        `SELECT COALESCE(display_name, username) AS name FROM user_account WHERE user_id = $1`,
        [req.user.userId]
      );
      administeredBy = user.rows[0]?.name || null;
    }

    if (appointmentId) {
      const appointment = await client.query(
        `SELECT appointment_id FROM appointment
          WHERE appointment_id = $1 AND pet_id = $2
            AND ($3::int IS NULL OR veterinarian_id = $3)`,
        [appointmentId, petId, veterinarianId]
      );
      if (!appointment.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Appointment does not belong to this pet or veterinarian.' });
      }
    }
    const saved = await client.query(
      `INSERT INTO vaccination
         (pet_id, veterinarian_id, vaccine_type, date_administered, next_due_date,
          notes, administered_by, appointment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING vaccination_id AS id, pet_id AS "petId",
                 vaccine_type AS vaccine, date_administered::text AS "dateAdministered",
                 next_due_date::text AS "nextDue", notes, administered_by AS "administeredBy",
                 appointment_id AS "appointmentId"`,
      [petId, veterinarianId, vaccine, date, nextDue, req.body.notes || null, administeredBy, appointmentId]
    );
    await audit(client, req.user.userId, 'INSERT', 'vaccination', saved.rows[0].id, `Recorded ${vaccine} for ${pet.rows[0].pet}.`);
    await notify(client, pet.rows[0].owner_user_id, 'record', 'Vaccination recorded',
      `${vaccine} was given to ${pet.rows[0].pet}. See Vaccination History for the next due date.`);
    await notifyStaff(client, 'record', 'Vaccination recorded',
      `${vaccine} was given to ${pet.rows[0].pet}.`, req.user.userId);
    await client.query('COMMIT');
    return res.status(201).json(saved.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/vaccination-reminders/:id/notify', authorize('Admin', 'Staff'), asyncRoute(async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid vaccination ID.' });
  const result = await db.query(
    `${VACCINATION_SELECT}
      WHERE vx.vaccination_id = $1 AND vx.next_due_date IS NOT NULL`,
    [id]
  );
  const vaccination = result.rows[0];
  if (!vaccination) return notFound(res, 'Vaccination reminder not found.');
  const phone = normalizePhone(vaccination.phone);
  if (!phone) return res.status(400).json({ error: 'The pet owner does not have a valid mobile number for reminders.' });
  const message = `${vaccination.vaccine} is due on ${vaccination.nextDue}. Please book an appointment to keep ${vaccination.pet} protected.`;
  await sendSms(phone, message);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE vaccination SET last_reminded_at = CURRENT_TIMESTAMP
        WHERE vaccination_id = $1
        RETURNING last_reminded_at AS "lastRemindedAt"`,
      [id]
    );
    await notify(client, vaccination.owner_user_id, 'reminder', `Vaccine reminder: ${vaccination.pet}`, message);
    await audit(client, req.user.userId, 'UPDATE', 'vaccination', id, `Sent a ${vaccination.vaccine} reminder.`);
    await client.query('COMMIT');
    return res.json({ sentAt: updated.rows[0].lastRemindedAt });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/appointments', authorize('Admin', 'Staff', 'Pet Owner'), asyncRoute(async (req, res) => {
  const petId = Number(req.body.petId);
  const vetInput = req.body.veterinarianId ?? req.body.vetId ?? req.body.vet ?? null;
  const date = requiredString(req.body.date, 'Appointment date', 10);
  const time = requiredString(req.body.time, 'Appointment time', 8);
  if (!validAppointmentDate(date)) return res.status(400).json({ error: 'Appointment date must be a valid YYYY-MM-DD date.' });
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return res.status(400).json({ error: 'Appointment time must be a valid 24-hour time.' });
  if (!Number.isInteger(petId) || petId < 1) return res.status(400).json({ error: 'Choose a valid pet.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    let vetId = vetInput == null || String(vetInput).toLowerCase().includes('assign') ? null : Number(vetInput);
    if (vetId !== null && (!Number.isInteger(vetId) || vetId < 1)) {
      const byName = await client.query(
        `SELECT veterinarian_id FROM veterinarian
          WHERE lower(name) = lower($1)`,
        [String(vetInput)]
      );
      vetId = byName.rows[0]?.veterinarian_id;
    }
    if (vetId !== null && (!Number.isInteger(vetId) || vetId < 1)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Choose a valid veterinarian.' });
    }
    const pet = await client.query(
      `SELECT p.owner_id, o.user_id, p.name AS pet_name
         FROM pet p JOIN owner o ON o.owner_id = p.owner_id
        WHERE p.pet_id = $1 AND p.pet_status = 'Active' AND (o.user_id IS NULL OR EXISTS (
          SELECT 1 FROM user_account u WHERE u.user_id = o.user_id AND u.account_status = 'Active'
        ))`,
      [petId]
    );
    if (!pet.rows[0]) {
      await client.query('ROLLBACK');
      return notFound(res, 'Pet not found or owner account is inactive.');
    }
    if (req.user.role === 'Pet Owner' && pet.rows[0].user_id !== req.user.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only book appointments for your own pets.' });
    }
    if (vetId !== null) {
      const vet = await client.query(
        `SELECT v.veterinarian_id FROM veterinarian v
          LEFT JOIN user_account u ON u.user_id = v.user_id
         WHERE v.veterinarian_id = $1 AND (v.user_id IS NULL OR u.account_status = 'Active')`,
        [vetId]
      );
      if (!vet.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Choose an active veterinarian.' });
      }
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [`${vetId}:${date}`, time]
      );
      const conflict = await client.query(
        `SELECT 1 FROM appointment
          WHERE veterinarian_id = $1 AND appointment_date = $2::date
            AND appointment_time = $3::time
            AND status NOT IN ('Completed', 'Cancelled', 'No Show', 'No-show')
          FOR UPDATE`,
        [vetId, date, time]
      );
      if (conflict.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'That veterinarian already has an appointment at this time.' });
      }
    }
    const status = req.user.role === 'Pet Owner' ? 'Pending' : 'Scheduled';
    const created = await client.query(
      `INSERT INTO appointment
         (pet_id, veterinarian_id, appointment_date, appointment_time, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING appointment_id`,
      [petId, vetId, date, time, req.body.reason || null, status]
    );
    const appointmentId = created.rows[0].appointment_id;
    await notify(client, pet.rows[0].user_id, 'appointment', 'Appointment requested',
      `${pet.rows[0].pet_name}'s appointment request for ${date} at ${time} was received.`);
    if (vetId !== null) {
      const vetAccount = await client.query('SELECT user_id FROM veterinarian WHERE veterinarian_id = $1', [vetId]);
      await notify(client, vetAccount.rows[0]?.user_id, 'appointment', 'New appointment',
        `${pet.rows[0].pet_name} has an appointment on ${date} at ${time}.`);
    }
    await notifyStaff(client, 'appointment', 'New appointment request',
      `${pet.rows[0].pet_name} has an appointment request for ${date} at ${time}.`, req.user.userId);
    const requestedServices = Array.isArray(req.body.services) ? req.body.services : [];
    for (const service of requestedServices) {
      let serviceId = Number(typeof service === 'object' ? service.id || service.serviceId : service);
      const quantity = Number(typeof service === 'object' ? service.quantity || 1 : 1);
      if ((!Number.isInteger(serviceId) || serviceId < 1) && typeof service === 'object' && service.name) {
        const byName = await client.query(
          `SELECT service_id FROM service
            WHERE lower(service_name) = lower($1)
              AND (description IS NULL OR description NOT LIKE $2)`,
          [String(service.name).split(' (')[0], INACTIVE_SERVICE_MARKER + '%']
        );
        serviceId = byName.rows[0]?.service_id;
      }
      if (!Number.isInteger(serviceId) || serviceId < 1 || !Number.isInteger(quantity) || quantity < 1) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid appointment service or quantity.' });
      }
      const serviceExists = await client.query(
        `SELECT service_id FROM service
          WHERE service_id = $1
            AND (description IS NULL OR description NOT LIKE $2)`,
        [serviceId, INACTIVE_SERVICE_MARKER + '%']
      );
      if (!serviceExists.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'An appointment service is unavailable.' });
      }
      await client.query(
        `INSERT INTO appointment_service (appointment_id, service_id, quantity)
         VALUES ($1, $2, $3)`,
        [appointmentId, serviceId, quantity]
      );
    }
    await audit(client, req.user.userId, 'INSERT', 'appointment', appointmentId, 'Booked an appointment.');
    await client.query('COMMIT');
    const result = await db.query(`${APPOINTMENT_SELECT} WHERE a.appointment_id = $1`, [appointmentId]);
    return res.status(201).json(mapAppointment(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.patch('/appointments/:id', authorize('Admin', 'Staff', 'Veterinarian', 'Pet Owner'), asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid appointment ID.' });
  const requestedStatus = req.body.status;
  const status = requestedStatus === undefined ? undefined : appointmentStatus(requestedStatus);
  if (requestedStatus !== undefined && !status) {
    return res.status(400).json({ error: 'Invalid appointment status.' });
  }
  if (req.body.date !== undefined) {
    const date = String(req.body.date);
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      return res.status(400).json({ error: 'Appointment date must be a valid YYYY-MM-DD date.' });
    }
  }
  if (req.body.time !== undefined && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(String(req.body.time))) {
    return res.status(400).json({ error: 'Appointment time must be a valid 24-hour time.' });
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const ownVet = req.user.role === 'Veterinarian';
    const ownOwner = req.user.role === 'Pet Owner';
    const query = await client.query(
      `SELECT a.appointment_id, a.status, p.owner_id, p.name AS pet_name,
              o.user_id AS owner_user_id, a.veterinarian_id, v.user_id,
              a.appointment_date::text AS appointment_date,
              to_char(a.appointment_time, 'HH24:MI') AS appointment_time
         FROM appointment a
         JOIN pet p ON p.pet_id = a.pet_id
         JOIN owner o ON o.owner_id = p.owner_id
         LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
        WHERE a.appointment_id = $1
        FOR UPDATE OF a`,
      [id]
    );
    const before = query.rows[0];
    if (!before) {
      await client.query('ROLLBACK');
      return notFound(res, 'Appointment not found.');
    }
    if (ownVet && before.user_id !== req.user.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only update appointments assigned to you.' });
    }
    if (ownOwner) {
      const owner = await client.query('SELECT owner_id FROM owner WHERE user_id = $1', [req.user.userId]);
      if (!owner.rows[0] || owner.rows[0].owner_id !== before.owner_id) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You can only update your own appointments.' });
      }
      if (!['Pending', 'Scheduled', 'Approved'].includes(before.status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'Only upcoming appointments can be changed.' });
      }
      if (requestedStatus !== 'cancelled' && requestedStatus !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Owners may only cancel or request a reschedule.' });
      }
      if (requestedStatus === 'pending' && (!req.body.date || !req.body.time)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'A new date and time are required to reschedule.' });
      }
      if (req.body.veterinarianId !== undefined || req.body.vet !== undefined) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Owners cannot reassign appointments.' });
      }
    }
    const hasVetUpdate = req.body.veterinarianId !== undefined || req.body.vet !== undefined;
    const vetInput = req.body.veterinarianId ?? req.body.vet;
    let nextVetId = !hasVetUpdate || vetInput == null || String(vetInput).toLowerCase().includes('assign')
      ? (!hasVetUpdate ? before.veterinarian_id : null)
      : Number(vetInput);
    if (nextVetId !== null && (!Number.isInteger(nextVetId) || nextVetId < 1) && req.body.vet) {
      const byName = await client.query(
        `SELECT veterinarian_id FROM veterinarian WHERE lower(name) = lower($1)`,
        [String(req.body.vet)]
      );
      nextVetId = byName.rows[0]?.veterinarian_id;
    }
    if (nextVetId !== null && (!Number.isInteger(nextVetId) || nextVetId < 1)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Choose a valid veterinarian.' });
    }
    if (ownVet && nextVetId !== before.veterinarian_id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Veterinarians cannot reassign appointments.' });
    }
    if (nextVetId !== null && nextVetId !== before.veterinarian_id) {
      const activeVet = await client.query(
        `SELECT v.veterinarian_id FROM veterinarian v
          LEFT JOIN user_account u ON u.user_id = v.user_id
         WHERE v.veterinarian_id = $1 AND (v.user_id IS NULL OR u.account_status = 'Active')`,
        [nextVetId]
      );
      if (!activeVet.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Choose an active veterinarian.' });
      }
    }
    const nextDate = req.body.date || before.appointment_date;
    const nextTime = req.body.time || before.appointment_time;
    if (nextVetId !== null && (nextVetId !== before.veterinarian_id || nextDate !== before.appointment_date || nextTime !== before.appointment_time)) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [`${nextVetId}:${nextDate}`, nextTime]
      );
      const conflict = await client.query(
        `SELECT 1 FROM appointment
          WHERE veterinarian_id = $1 AND appointment_date = $2::date
            AND appointment_time = $3::time AND appointment_id <> $4
            AND status NOT IN ('Completed', 'Cancelled', 'No Show', 'No-show')
          FOR UPDATE`,
        [nextVetId, nextDate, nextTime, id]
      );
      if (conflict.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'That veterinarian already has an appointment at this time.' });
      }
    }
    const dbStatus = status === undefined ? before.status : status;
    if (ownVet && status !== undefined && dbStatus !== 'With Vet') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Use the medical record form to complete a visit.' });
    }
    const update = await client.query(
      `UPDATE appointment
          SET status = $2, veterinarian_id = $3,
              appointment_date = COALESCE($4, appointment_date),
              appointment_time = COALESCE($5, appointment_time),
              reason = COALESCE($6, reason),
              cancellation_reason = COALESCE($7, cancellation_reason),
              reschedule_reason = COALESCE($8, reschedule_reason),
              rescheduled_from_date = COALESCE($9::date, rescheduled_from_date),
              rescheduled_from_time = COALESCE($10::time, rescheduled_from_time),
              updated_date = CURRENT_TIMESTAMP
        WHERE appointment_id = $1
        RETURNING appointment_id`,
      [id, dbStatus, nextVetId, req.body.date || null, req.body.time || null, req.body.reason || null,
        req.body.declineReason || req.body.cancellationReason || null,
        req.body.rescheduleReason || null,
        req.body.rescheduledFrom?.date || null,
        req.body.rescheduledFrom?.time || null]
    );
    await audit(client, req.user.userId, 'UPDATE', 'appointment', id, `Updated appointment ${id}.`);
    if (status !== undefined || req.body.date !== undefined || req.body.time !== undefined || nextVetId !== before.veterinarian_id) {
      const message = `Appointment for ${before.pet_name} was updated to ${dbStatus} on ${nextDate} at ${nextTime}.`;
      await notify(client, before.owner_user_id, 'appointment', 'Appointment updated', message);
      if (before.veterinarian_id && before.veterinarian_id !== nextVetId) {
        const oldVet = await client.query('SELECT user_id FROM veterinarian WHERE veterinarian_id = $1', [before.veterinarian_id]);
        await notify(client, oldVet.rows[0]?.user_id, 'appointment', 'Appointment updated', message);
      }
      if (nextVetId) {
        const nextVet = await client.query('SELECT user_id FROM veterinarian WHERE veterinarian_id = $1', [nextVetId]);
        await notify(client, nextVet.rows[0]?.user_id, 'appointment', 'Appointment updated', message);
      }
      await notifyStaff(client, 'appointment', 'Appointment updated', message, req.user.userId);
    }
    await client.query('COMMIT');
    const result = await db.query(`${APPOINTMENT_SELECT} WHERE a.appointment_id = $1`, [update.rows[0].appointment_id]);
    return res.json(mapAppointment(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.get('/vet/patients', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT DISTINCT p.owner_id AS owner, p.pet_id AS "petId", p.name,
            p.species, p.breed, p.gender AS sex, p.date_of_birth AS dob,
            p.allergies, o.name AS "ownerName"
       FROM appointment a
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE v.user_id = $1
      ORDER BY p.name`,
    [req.user.userId]
  );
  return res.json(result.rows);
}));

router.get('/vet/patients/:petId', authorize('Veterinarian', 'Admin', 'Staff'), asyncRoute(async (req, res) => {
  const petId = Number(req.params.petId);
  const pet = await db.query(
    `SELECT p.pet_id AS id, p.pet_id, p.owner_id AS owner, p.name, p.species, p.breed,
            p.gender AS sex, p.date_of_birth AS dob, p.allergies, p.notes, p.photo,
            o.name AS "ownerName", o.email AS "ownerEmail", o.phone AS "ownerPhone"
       FROM pet p JOIN owner o ON o.owner_id = p.owner_id
      WHERE p.pet_id = $1`,
    [petId]
  );
  if (!pet.rows[0]) return notFound(res, 'Patient not found.');
  if (req.user.role === 'Veterinarian') {
    const assigned = await db.query(
      `SELECT 1 FROM appointment a
        LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       WHERE a.pet_id = $1 AND v.user_id = $2 LIMIT 1`,
      [petId, req.user.userId]
    );
    if (!assigned.rowCount) return res.status(403).json({ error: 'This patient is not assigned to you.' });
  }
  const records = await db.query(
    `SELECT r.record_id AS id, r.record_id, r.appointment_id, r.diagnosis, r.treatment, r.notes,
            r.record_date AS date, a.veterinarian_id, v.name AS vet
       FROM medical_record r
       JOIN appointment a ON a.appointment_id = r.appointment_id
       LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE a.pet_id = $1 ORDER BY r.record_date DESC, r.record_id DESC`,
    [petId]
  );
  const prescriptions = await db.query(
    `SELECT rx.prescription_id AS id, rx.record_id, rx.medication_name AS medication,
            rx.dosage AS dose, rx.instructions, rx.quantity, rx.date_prescribed AS date
       FROM prescription rx
       JOIN medical_record r ON r.record_id = rx.record_id
       JOIN appointment a ON a.appointment_id = r.appointment_id
      WHERE a.pet_id = $1 ORDER BY rx.date_prescribed DESC, rx.prescription_id DESC`,
    [petId]
  );
  return res.json({ pet: pet.rows[0], visits: records.rows, prescriptions: prescriptions.rows });
}));

router.get('/pets/:id', authorize('Veterinarian', 'Admin', 'Staff'), asyncRoute(async (req, res) => {
  const petId = Number(req.params.id);
  const result = await db.query(
    `SELECT p.pet_id AS id, p.pet_id, p.owner_id AS owner, p.name, p.species,
            p.breed, p.gender AS sex, p.date_of_birth AS dob, p.allergies,
            p.notes, p.photo, o.name AS "ownerName", o.email AS "ownerEmail",
            o.phone AS "ownerPhone"
       FROM pet p JOIN owner o ON o.owner_id = p.owner_id
      WHERE p.pet_id = $1`,
    [petId]
  );
  if (!result.rows[0]) return notFound(res, 'Patient not found.');
  if (req.user.role === 'Veterinarian') {
    const assigned = await db.query(
      `SELECT 1 FROM appointment a
        LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       WHERE a.pet_id = $1 AND v.user_id = $2 LIMIT 1`,
      [petId, req.user.userId]
    );
    if (!assigned.rowCount) return res.status(403).json({ error: 'This patient is not assigned to you.' });
  }
  const visits = await db.query(
    `SELECT r.record_id AS id, r.appointment_id, r.diagnosis, r.treatment, r.notes,
            r.record_date AS date, v.name AS vet
       FROM medical_record r
       JOIN appointment a ON a.appointment_id = r.appointment_id
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE a.pet_id = $1 ORDER BY r.record_date DESC`,
    [petId]
  );
  const prescriptions = await db.query(
    `SELECT rx.prescription_id AS id, rx.record_id, rx.medication_name AS medication,
            rx.dosage AS dose, rx.instructions, rx.quantity, rx.date_prescribed AS date
       FROM prescription rx
       JOIN medical_record r ON r.record_id = rx.record_id
       JOIN appointment a ON a.appointment_id = r.appointment_id
      WHERE a.pet_id = $1 ORDER BY rx.date_prescribed DESC`,
    [petId]
  );
  return res.json({ pet: result.rows[0], owner: result.rows[0], visits: visits.rows, prescriptions: prescriptions.rows });
}));

router.get('/vet/medical-records', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const result = await db.query(
    `SELECT r.record_id AS id, r.appointment_id, r.diagnosis, r.treatment, r.notes,
            r.record_date AS date, a.pet_id, p.owner_id AS owner, p.name AS pet_name,
            v.name AS veterinarian
       FROM medical_record r
       JOIN appointment a ON a.appointment_id = r.appointment_id
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE v.user_id = $1 ORDER BY r.record_date DESC, r.record_id DESC`,
    [req.user.userId]
  );
  return res.json(result.rows);
}));

router.get('/vet/appointments/:id/record', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const appointmentId = validId(req.params.id);
  if (!appointmentId) return res.status(400).json({ error: 'Invalid appointment ID.' });
  const assigned = await db.query(
    `SELECT a.appointment_id
       FROM appointment a
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE a.appointment_id = $1 AND v.user_id = $2`,
    [appointmentId, req.user.userId]
  );
  if (!assigned.rowCount) return notFound(res, 'Appointment not found or not assigned to you.');
  const record = await db.query(
    `SELECT record_id AS id, appointment_id AS "appointmentId", diagnosis, treatment,
            notes, record_date::text AS date, services
       FROM medical_record WHERE appointment_id = $1`,
    [appointmentId]
  );
  if (!record.rows[0]) return res.json({ record: null, prescriptions: [], vaccinations: [] });
  const prescriptions = await db.query(
    `SELECT prescription_id AS id, medication_name AS medication, dosage AS dose,
            instructions, quantity, date_prescribed::text AS date
       FROM prescription WHERE record_id = $1
      ORDER BY prescription_id`,
    [record.rows[0].id]
  );
  const vaccinations = await db.query(
    `${VACCINATION_SELECT}
      WHERE vx.appointment_id = $1
      ORDER BY vx.vaccination_id`,
    [appointmentId]
  );
  return res.json({ record: record.rows[0], prescriptions: prescriptions.rows, vaccinations: vaccinations.rows });
}));

router.put('/appointments/:id/record', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const appointmentId = Number(req.params.id);
  if (!Number.isInteger(appointmentId) || appointmentId < 1) return res.status(400).json({ error: 'Invalid appointment ID.' });
  const diagnosis = requiredString(req.body.diagnosis, 'Diagnosis', 10000);
  const date = requiredString(req.body.date, 'Record date', 10);
  const assigned = await db.query(
    `SELECT a.appointment_id, a.pet_id, a.veterinarian_id, a.status,
            p.name AS pet_name, o.user_id AS owner_user_id, v.user_id, v.name AS veterinarian_name
       FROM appointment a
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
      WHERE a.appointment_id = $1`,
    [appointmentId]
  );
  if (!assigned.rows[0]) return notFound(res, 'Appointment not found.');
  if (Number(assigned.rows[0].user_id) !== Number(req.user.userId)) return res.status(403).json({ error: 'You can only update records for your assigned appointments.' });
  if (!Array.isArray(req.body.prescriptions)) return res.status(400).json({ error: 'Prescriptions must be an array.' });
  if (req.body.vaccinations !== undefined && !Array.isArray(req.body.vaccinations)) {
    return res.status(400).json({ error: 'Vaccinations must be an array.' });
  }
  if (req.body.services !== undefined && !Array.isArray(req.body.services)) {
    return res.status(400).json({ error: 'Services must be an array.' });
  }
  if (req.body.complete !== undefined && typeof req.body.complete !== 'boolean') {
    return res.status(400).json({ error: 'Complete must be a boolean.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const record = await client.query(
      `INSERT INTO medical_record (appointment_id, diagnosis, treatment, notes, record_date, services)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (appointment_id)
       DO UPDATE SET diagnosis = EXCLUDED.diagnosis, treatment = EXCLUDED.treatment,
                     notes = EXCLUDED.notes, record_date = EXCLUDED.record_date,
                     services = CASE WHEN $7::boolean THEN EXCLUDED.services ELSE medical_record.services END
       RETURNING record_id, appointment_id, diagnosis, treatment, notes, record_date, services`,
      [appointmentId, diagnosis, req.body.treatment || null, req.body.notes || null, date,
        JSON.stringify(req.body.services || []), req.body.services !== undefined]
    );
    const recordId = record.rows[0].record_id;
    await client.query('DELETE FROM prescription WHERE record_id = $1', [recordId]);
    const prescriptions = [];
    for (const prescription of req.body.prescriptions) {
      const medication = requiredString(prescription.medication, 'Medication', 100);
      const dosage = String(prescription.dose || '').trim();
      const instructions = String(prescription.instructions || '').trim();
      const quantity = Number(prescription.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error('Prescription quantity must be a positive whole number.'), { status: 400 });
      const saved = await client.query(
        `INSERT INTO prescription (record_id, medication_name, dosage, instructions, quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING prescription_id AS id, record_id, medication_name AS medication,
                   dosage AS dose, instructions, quantity, date_prescribed AS date`,
        [recordId, medication, dosage, instructions, quantity]
      );
      prescriptions.push(saved.rows[0]);
    }
    const vaccinations = [];
    if (req.body.vaccinations !== undefined) {
      await client.query('DELETE FROM vaccination WHERE appointment_id = $1', [appointmentId]);
      for (const vaccination of req.body.vaccinations) {
        const vaccine = requiredString(vaccination.vaccine, 'Vaccine name', 100);
        const dateAdministered = requiredString(vaccination.dateAdministered, 'Date administered', 10);
        const nextDue = vaccination.nextDue == null || vaccination.nextDue === ''
          ? null
          : requiredString(vaccination.nextDue, 'Next due date', 10);
        if (!validAppointmentDate(dateAdministered)) {
          throw Object.assign(new Error('Date administered must be a valid YYYY-MM-DD date.'), { status: 400 });
        }
        if (nextDue && (!validAppointmentDate(nextDue) || nextDue < dateAdministered)) {
          throw Object.assign(new Error('Next due date must be a valid date on or after the date administered.'), { status: 400 });
        }
        const saved = await client.query(
          `INSERT INTO vaccination
             (pet_id, veterinarian_id, vaccine_type, date_administered, next_due_date,
              notes, administered_by, appointment_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING vaccination_id AS id, pet_id AS "petId",
                     vaccine_type AS vaccine, date_administered::text AS "dateAdministered",
                     next_due_date::text AS "nextDue", notes, administered_by AS "administeredBy",
                     appointment_id AS "appointmentId"`,
          [assigned.rows[0].pet_id, assigned.rows[0].veterinarian_id, vaccine,
            dateAdministered, nextDue, null, assigned.rows[0].veterinarian_name, appointmentId]
        );
        vaccinations.push(saved.rows[0]);
      }
      if (vaccinations.length) {
        const names = vaccinations.map((item) => item.vaccine).join(', ');
        const message = `${names} ${vaccinations.length === 1 ? 'was' : 'were'} recorded for ${assigned.rows[0].pet_name}.`;
        await notify(client, assigned.rows[0].owner_user_id, 'record', 'Vaccination recorded', message);
        await notifyStaff(client, 'record', 'Vaccination recorded', message, req.user.userId);
      }
    }
    if (req.body.complete === true) {
      if (!['Checked-in', 'With Vet', 'In Progress'].includes(assigned.rows[0].status)) {
        throw Object.assign(new Error('Only checked-in or in-progress appointments can be completed.'), { status: 409 });
      }
      await client.query(
        `UPDATE appointment
            SET status = 'Completed', updated_date = CURRENT_TIMESTAMP
          WHERE appointment_id = $1`,
        [appointmentId]
      );
      await notify(client, assigned.rows[0].owner_user_id, 'appointment', 'Visit completed',
        `${assigned.rows[0].pet_name} has finished the visit. See Medical Records for the details.`);
      await notifyStaff(client, 'appointment', 'Visit completed',
        `${assigned.rows[0].pet_name} has finished the visit.`, req.user.userId);
    } else {
      const message = `The medical record for ${assigned.rows[0].pet_name} was saved.`;
      await notify(client, assigned.rows[0].owner_user_id, 'record', 'Medical record updated', message);
      await notifyStaff(client, 'record', 'Medical record updated', message, req.user.userId);
    }
    await audit(client, req.user.userId, 'UPDATE', 'medical_record', recordId, 'Saved a medical record and its prescriptions.');
    await client.query('COMMIT');
    return res.json({
      record: record.rows[0], prescriptions, vaccinations,
      appointmentStatus: req.body.complete === true ? 'Completed' : assigned.rows[0].status
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/appointments/:id/medical-record', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const appointmentId = Number(req.params.id);
  const diagnosis = requiredString(req.body.diagnosis, 'Diagnosis', 10000);
  const assigned = await db.query(
    `SELECT a.appointment_id, v.user_id
       FROM appointment a JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE a.appointment_id = $1`,
    [appointmentId]
  );
  if (!assigned.rows[0]) return notFound(res, 'Appointment not found.');
  if (assigned.rows[0].user_id !== req.user.userId) return res.status(403).json({ error: 'You can only record visits for your assigned appointments.' });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const record = await client.query(
      `INSERT INTO medical_record (appointment_id, diagnosis, treatment, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (appointment_id)
       DO UPDATE SET diagnosis = EXCLUDED.diagnosis, treatment = EXCLUDED.treatment, notes = EXCLUDED.notes
       RETURNING record_id, appointment_id, diagnosis, treatment, notes, record_date`,
      [appointmentId, diagnosis, req.body.treatment || null, req.body.notes || null]
    );
    await audit(client, req.user.userId, 'INSERT', 'medical_record', record.rows[0].record_id, 'Created or updated a medical record.');
    await client.query('COMMIT');
    return res.status(201).json(record.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/medical-records/:recordId/prescriptions', authorize('Veterinarian'), asyncRoute(async (req, res) => {
  const medication = requiredString(req.body.medication || req.body.medication_name, 'Medication', 100);
  const dosage = requiredString(req.body.dose || req.body.dosage, 'Dosage', 50);
  const instructions = requiredString(req.body.instructions, 'Instructions', 10000);
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'Quantity must be a positive whole number.' });
  const assigned = await db.query(
    `SELECT 1 FROM medical_record r
       JOIN appointment a ON a.appointment_id = r.appointment_id
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
      WHERE r.record_id = $1 AND v.user_id = $2`,
    [req.params.recordId, req.user.userId]
  );
  if (!assigned.rowCount) return notFound(res, 'Medical record not found or not assigned to you.');
  const result = await db.query(
    `INSERT INTO prescription (record_id, medication_name, dosage, instructions, quantity)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING prescription_id AS id, record_id, medication_name AS medication,
               dosage AS dose, instructions, quantity, date_prescribed AS date`,
    [req.params.recordId, medication, dosage, instructions, quantity]
  );
  await db.query(
    `INSERT INTO audit_log (user_id, action_type, table_name, record_id, action_description)
     VALUES ($1, 'INSERT', 'prescription', $2, $3)`,
    [req.user.userId, result.rows[0].id, `Added prescription for ${medication}.`]
  );
  return res.status(201).json(result.rows[0]);
}));

router.get(['/audit', '/audit-log'], authorize('Admin'), asyncRoute(async (req, res) => {
  const values = [];
  const where = [];
  if (req.query.user) {
    const userId = Number(req.query.user);
    if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: 'User filter must be a valid user ID.' });
    values.push(userId);
    where.push(`l.user_id = $${values.length}`);
  }
  if (req.query.action) {
    const action = String(req.query.action).toUpperCase();
    const mappedAction = action === 'CREATE' ? 'INSERT' : action;
    if (!['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'].includes(mappedAction)) {
      return res.status(400).json({ error: 'Invalid audit action filter.' });
    }
    values.push(mappedAction);
    where.push(`l.action_type = $${values.length}`);
  }
  if (req.query.record) {
    values.push(String(req.query.record));
    where.push(`l.table_name = $${values.length}`);
  }
  if (req.query.from) {
    if (!validAppointmentDate(req.query.from)) return res.status(400).json({ error: 'From date must be a valid YYYY-MM-DD date.' });
    values.push(req.query.from);
    where.push(`l.action_date >= $${values.length}::date`);
  }
  if (req.query.to) {
    if (!validAppointmentDate(req.query.to)) return res.status(400).json({ error: 'To date must be a valid YYYY-MM-DD date.' });
    values.push(req.query.to);
    where.push(`l.action_date < ($${values.length}::date + INTERVAL '1 day')`);
  }
  const result = await db.query(
    `SELECT l.audit_id AS id, l.user_id, u.username, COALESCE(u.display_name, u.username, 'Unknown') AS user,
            u.role, l.action_type, l.table_name, l.record_id, l.action_description,
            l.action_date AS at
       FROM audit_log l
       LEFT JOIN user_account u ON u.user_id = l.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.action_date DESC, l.audit_id DESC
      LIMIT 1000`,
    values
  );
  return res.json(result.rows.map((row) => ({
    ...row,
    role: UI_ROLES[row.role] || null,
    action: row.action_type.toLowerCase(),
    record: row.table_name,
    details: row.action_description,
    createdAt: row.at
  })));
}));

module.exports = router;
