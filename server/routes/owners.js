const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { requireRole } = require('../middleware/session');
const { writeAudit } = require('../services/activity');

const router = express.Router();

router.get('/:id', requireRole('staff', 'admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.owner_id AS id, o.user_id AS "userId", o.name, o.email,
              o.phone, o.address, o.photo, o.first_name AS "firstName",
              o.middle_name AS "middleName", o.last_name AS "lastName",
              o.registration_date AS "createdAt", ua.username,
              ua.account_status AS "accountStatus"
       FROM owner o
       JOIN user_account ua ON ua.user_id = o.user_id
       WHERE o.owner_id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Owner not found.' });
    res.json({ owner: result.rows[0] });
  } catch (error) {
    console.error('Owner profile lookup failed:', error);
    res.status(500).json({ error: 'Could not load the owner.' });
  }
});

router.put('/:id', requireRole('staff', 'admin'), async (req, res) => {
  const { name, email, phone, address, photo, currentPassword, newPassword } = req.body;
  const normalizedEmail = email === undefined ? undefined : String(email || '').trim();
  const normalizedPhone = phone === undefined ? undefined : String(phone || '').replace(/[\s-]/g, '');
  if (!String(name || '').trim() ||
      (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) ||
      (normalizedPhone && !/^(09\d{9}|\+639\d{9})$/.test(normalizedPhone))) {
    return res.status(400).json({ error: 'Enter a valid owner name and email address.' });
  }
  if ((currentPassword || newPassword) &&
      (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8)) {
    return res.status(400).json({ error: 'Enter the current password and a new password of at least 8 characters.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const account = await client.query(
      `SELECT o.user_id, ua.password_hash, o.email AS owner_email,
              o.phone AS owner_phone, o.address, o.photo
       FROM owner o JOIN user_account ua ON ua.user_id = o.user_id
       WHERE o.owner_id = $1 FOR UPDATE OF o, ua`,
      [req.params.id]
    );
    if (!account.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Owner not found.' });
    }
    if (currentPassword || newPassword) {
      if (!(await bcrypt.compare(currentPassword, account.rows[0].password_hash))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    }
    const emailValue = normalizedEmail === undefined ? account.rows[0].owner_email : normalizedEmail || null;
    const phoneValue = normalizedPhone === undefined ? account.rows[0].owner_phone : normalizedPhone || null;
    const addressValue = address === undefined ? account.rows[0].address : String(address || '').trim() || null;
    const photoValue = photo === undefined ? account.rows[0].photo : photo || null;
    await client.query(
      `UPDATE user_account
       SET email = $1,
           phone = $2,
           password_hash = COALESCE($3, password_hash)
       WHERE user_id = $4`,
      [emailValue, phoneValue, newPassword ? await bcrypt.hash(newPassword, 10) : null, account.rows[0].user_id]
    );
    const result = await client.query(
      `UPDATE owner
       SET name = $1, email = $2, phone = $3, address = $4, photo = $5
       WHERE owner_id = $6
       RETURNING owner_id AS id, user_id AS "userId", name, email, phone,
                 address, photo, registration_date AS "createdAt"`,
       [String(name).trim(), emailValue, phoneValue, addressValue, photoValue, req.params.id]
    );
    await writeAudit(client, req.auth.userId, 'update', 'owner', req.params.id, `Updated owner ${String(name).trim()}.`);
    await client.query('COMMIT');
    res.json({ owner: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'That email address is already in use.' });
    console.error('Owner profile update failed:', error);
    res.status(500).json({ error: 'Could not save the owner profile.' });
  } finally {
    client.release();
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT owner_id, user_id, name FROM owner WHERE owner_id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Owner not found.' });
    }
    const pets = await client.query('SELECT COUNT(*)::integer AS count FROM pet WHERE owner_id = $1', [req.params.id]);
    if (pets.rows[0].count > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This owner still has pets. Delete or transfer the pets first.' });
    }
    await writeAudit(client, req.auth.userId, 'delete', 'owner', req.params.id, `Removed owner ${result.rows[0].name}.`);
    await client.query('DELETE FROM owner WHERE owner_id = $1', [req.params.id]);
    await client.query(
      `UPDATE user_account SET account_status = 'Inactive' WHERE user_id = $1`,
      [result.rows[0].user_id]
    );
    await client.query('COMMIT');
    res.status(204).end();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Owner deletion failed:', error);
    res.status(500).json({ error: 'Could not remove the owner.' });
  } finally {
    client.release();
  }
});

router.get('/', requireRole('staff', 'admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.owner_id AS id, o.user_id AS "userId", o.name, o.email,
              o.phone, o.address, o.registration_date AS "createdAt",
              COUNT(p.pet_id)::integer AS "petCount"
       FROM owner o
       LEFT JOIN pet p ON p.owner_id = o.owner_id
       GROUP BY o.owner_id
       ORDER BY o.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Owner list failed:', error);
    res.status(500).json({ error: 'Could not load owners.' });
  }
});

router.post('/walk-in', requireRole('staff', 'admin'), async (req, res) => {
  const { firstName, middleName, lastName, email, phone } = req.body;
  const first = String(firstName || '').trim();
  const middle = String(middleName || '').trim();
  const last = String(lastName || '').trim();
  const normalizedEmail = String(email || '').trim();
  const normalizedPhone = String(phone || '').trim();
  const name = [first, middle, last].filter(Boolean).join(' ');
  if (!first || !last || !normalizedPhone) {
    return res.status(400).json({ error: 'Enter the owner first name, last name, and phone number.' });
  }
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const username = `walkin_${crypto.randomBytes(12).toString('hex')}`;
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const account = await client.query(
      `INSERT INTO user_account (username, password_hash, role, email, account_status)
       VALUES ($1, $2, 'Pet Owner', $3, 'Active')
       RETURNING user_id`,
      [username, passwordHash, normalizedEmail || null]
    );
    const owner = await client.query(
      `INSERT INTO owner (user_id, name, email, phone, first_name, middle_name, last_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING owner_id AS id, user_id AS "userId", name, email, phone,
                 address, registration_date AS "createdAt"`,
      [account.rows[0].user_id, name, normalizedEmail || null, normalizedPhone, first, middle || null, last]
    );
    await writeAudit(client, req.auth.userId, 'create', 'owner', owner.rows[0].id, `Registered walk-in owner ${name}.`);
    await client.query('COMMIT');
    res.status(201).json({ owner: owner.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
    console.error('Walk-in owner creation failed:', error);
    res.status(500).json({ error: 'Could not register the walk-in owner.' });
  } finally {
    client.release();
  }
});

module.exports = router;
