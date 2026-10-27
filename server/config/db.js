const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  options: '-c search_path=public,accounts,clinic,medical,system',
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
  end: () => pool.end(),
};