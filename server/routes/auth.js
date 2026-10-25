const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');
const {
  issueSession,
  normalizeRole,
  revokeSession,
  requireSession,
} = require('../middleware/session');

// @route   POST /api/auth/register
// @desc    Register a new pet owner account & profile
router.post('/register', async (req, res) => {
  const {
    name,
    firstName,
    middleName,
    lastName,
    email,
    phone,
    address,
    username,
    password,
    photo
  } = req.body;

  if (!name || !email || !phone || !address || !username || !password) {
    return res.status(400).json({ error: 'Complete all required registration fields.' });
  }
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(String(username)) || String(password).length < 8) {
    return res.status(400).json({ error: 'Username or password does not meet the required format.' });
  }

  try {
    // 1. Check if username or email already exists
    const existingUser = await db.query(
      'SELECT * FROM user_account WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists.' });
    }

    // 2. Hash the password securely
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        `INSERT INTO user_account (username, password_hash, role, email, account_status)
         VALUES ($1, $2, 'Pet Owner', $3, 'Active') RETURNING user_id`,
        [username, passwordHash, email]
      );
      const userId = userResult.rows[0].user_id;

      await client.query(
        `INSERT INTO owner
           (user_id, name, email, phone, address, first_name, middle_name, last_name, photo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, name, email, phone, address, firstName || null, middleName || null, lastName || null, photo || null]
      );
      await client.query('COMMIT');
      res.status(201).json({ message: 'Registration successful!', userId });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Username or email already exists.' });
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user and return role & basic info
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // 1. Find user by username
    const result = await db.query(
      `SELECT ua.*,
              o.owner_id,
              COALESCE(o.name, v.name, ua.display_name, ua.username) AS display_name
       FROM user_account ua
       LEFT JOIN owner o ON o.user_id = ua.user_id
       LEFT JOIN veterinarian v ON v.user_id = ua.user_id
       WHERE ua.username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password.' });
    }

    const user = result.rows[0];

    // 2. Check if account is active
    if (user.account_status !== 'Active') {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    // 3. Compare password hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password.' });
    }

    const role = normalizeRole(user.role);
    if (!role) {
      return res.status(403).json({ error: 'This account has an unsupported role.' });
    }
    await issueSession(res, user.user_id, role);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      message: 'Login successful',
      user: {
        userId: user.user_id,
        ownerId: user.owner_id || null,
        username: user.username,
        name: user.display_name,
        role,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

router.get('/me', requireSession, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT ua.user_id, ua.username, ua.role, ua.email, o.owner_id,
              COALESCE(o.name, v.name, ua.display_name, ua.username) AS display_name
       FROM user_account ua
       LEFT JOIN owner o ON o.user_id = ua.user_id
       LEFT JOIN veterinarian v ON v.user_id = ua.user_id
       WHERE ua.user_id = $1 AND ua.account_status = 'Active'`,
      [req.auth.userId]
    );
    if (result.rows.length === 0) {
      await revokeSession(req, res);
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const user = result.rows[0];
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      user: {
        userId: user.user_id,
        ownerId: user.owner_id || null,
        username: user.username,
        name: user.display_name,
        role: normalizeRole(user.role),
        email: user.email
      }
    });
  } catch (err) {
    console.error('Session validation error:', err);
    res.status(500).json({ error: 'Server error while validating the session.' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    await revokeSession(req, res);
    res.status(204).end();
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Could not end the session.' });
  }
});

module.exports = router;