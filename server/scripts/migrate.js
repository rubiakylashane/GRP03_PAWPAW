const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function migrate() {
  const client = await db.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const directory = path.join(__dirname, '..', 'migrations');
    const files = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();

    for (const file of files) {
      const exists = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [file]
      );
      if (exists.rows.length > 0) {
        console.log(`Skipping ${file}; already applied.`);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(directory, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied ${file}.`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
    await db.end();
  }
}

migrate().catch((error) => {
  console.error('Database migration failed:', error.message);
  process.exitCode = 1;
});
