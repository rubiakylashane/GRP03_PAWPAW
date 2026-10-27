const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../config/db');

async function resetAdmin() {
  try {
    const username = process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin';
    const password = crypto.randomBytes(24).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.query(
      `UPDATE user_account
       SET password_hash = $1
       WHERE username = $2
         AND role = 'Admin'
         AND account_status = 'Active'
       RETURNING username`,
      [passwordHash, username]
    );

    if (result.rows.length === 0) {
      throw new Error(`No active admin found with username "${username}".`);
    }

    console.log('Admin password reset successfully!');
    console.log(`Username: ${result.rows[0].username}`);
    console.log(`New password: ${password}`);
    console.log('Save this password privately before closing the terminal.');
  } finally {
    await db.end();
  }
}

resetAdmin().catch((error) => {
  console.error('Password reset failed:', error.message);
  process.exitCode = 1;
});