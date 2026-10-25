const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/db');
const { requireRole } = require('../middleware/session');

const router = express.Router();

router.get('/me', requireRole('owner'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.owner_id AS "ownerId", o.name, ua.email, o.phone, o.address, o.photo,
              o.registration_date AS "memberSince"
       FROM owner o
       JOIN user_account ua ON ua.user_id = o.user_id
       WHERE o.user_id = $1`,
      [req.auth.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Owner profile not found.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Profile fetch failed:', error);
    res.status(500).json({ error: 'Could not load the owner profile.' });
  }
});

router.put('/me', requireRole('owner'), async (req, res) => {
  const { name, email, phone, address, photo, currentPassword, newPassword } = req.body;
  if (!String(name || '').trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''))) {
    return res.status(400).json({ error: 'Enter a valid name and email address.' });
  }
  if ((currentPassword || newPassword) &&
      (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8)) {
    return res.status(400).json({ error: 'Enter your current password and a new password of at least 8 characters.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const owner = await client.query(
      'SELECT owner_id FROM owner WHERE user_id = $1 FOR UPDATE',
      [req.auth.userId]
    );
    if (!owner.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Owner profile not found.' });
    }
    if (currentPassword || newPassword) {
      const account = await client.query(
        'SELECT password_hash FROM user_account WHERE user_id = $1 FOR UPDATE',
        [req.auth.userId]
      );
      if (!account.rows[0] || !(await bcrypt.compare(currentPassword, account.rows[0].password_hash))) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    }
    await client.query(
      `UPDATE user_account
       SET email = $1, password_hash = COALESCE($2, password_hash)
       WHERE user_id = $3`,
      [String(email).trim(), newPassword ? await bcrypt.hash(newPassword, 10) : null, req.auth.userId]
    );
    const result = await client.query(
      `UPDATE owner
       SET name = $1, email = $2, phone = $3, address = $4, photo = $5
       WHERE user_id = $6
       RETURNING owner_id AS "ownerId", name, email, phone, address, photo,
                 registration_date AS "memberSince"`,
      [String(name).trim(), String(email).trim(), phone || null, address || null, photo || null, req.auth.userId]
    );
    await client.query('COMMIT');
    res.json({ profile: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'That email address is already in use.' });
    console.error('Profile update failed:', error);
    res.status(500).json({ error: 'Could not save the owner profile.' });
  } finally {
    client.release();
  }
});

router.post('/me/password', requireRole('owner', 'staff', 'vet', 'admin'), async (req, res) => {
  const { current, next } = req.body;
  if (typeof current !== 'string' || typeof next !== 'string' || next.length < 8) {
    return res.status(400).json({ error: 'The new password must contain at least 8 characters.' });
  }
  try {
    const account = await db.query(
      'SELECT password_hash FROM user_account WHERE user_id = $1 AND account_status = $2',
      [req.auth.userId, 'Active']
    );
    if (!account.rows[0] || !(await bcrypt.compare(current, account.rows[0].password_hash))) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    const passwordHash = await bcrypt.hash(next, 10);
    await db.query('UPDATE user_account SET password_hash = $1 WHERE user_id = $2', [passwordHash, req.auth.userId]);
    res.status(204).end();
  } catch (error) {
    console.error('Password update failed:', error);
    res.status(500).json({ error: 'Could not update the password.' });
  }
});

module.exports = router;
