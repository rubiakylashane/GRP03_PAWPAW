const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/db');

async function seed() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
  const password = crypto.randomBytes(24).toString('base64url');
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    const existingAdmin = await client.query(
      "SELECT username FROM user_account WHERE role = 'Admin' AND account_status = 'Active' LIMIT 1"
    );
    if (existingAdmin.rows.length > 0) {
      await client.query('ROLLBACK');
      console.log(`An active administrator already exists (${existingAdmin.rows[0].username}); no account was created.`);
      return;
    }

    const existingUsername = await client.query(
      'SELECT 1 FROM user_account WHERE username = $1',
      [username]
    );
    if (existingUsername.rows.length > 0) {
      throw new Error(`Username "${username}" already exists. Set BOOTSTRAP_ADMIN_USERNAME in server/.env to another unique username.`);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO user_account (username, password_hash, role, account_status, display_name)
       VALUES ($1, $2, 'Admin', 'Active', 'Clinic Administrator')`,
      [username, passwordHash]
    );
    await client.query('COMMIT');
    console.log('Bootstrap administrator created. Save this password privately; it is shown only once.');
    console.log(`Username: ${username}`);
    console.log(`Temporary password: ${password}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

seed().catch((error) => {
  console.error('Database seed failed:', error.message);
  process.exitCode = 1;
});