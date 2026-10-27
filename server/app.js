require('dotenv').config();

const express = require('express');
const path = require('path');
const authRoutes = require('./routes/auth');
const clinicRoutes = require('./routes/clinic');
const passwordResetRoutes = require('./routes/password-reset');
const integrationRoutes = require('./routes/integrations');

const app = express();
const webRoot = path.resolve(__dirname, '..');

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/forgot-password', passwordResetRoutes);
app.use('/api', integrationRoutes);
app.use('/api', clinicRoutes);

app.get('/', (_req, res) => res.type('html').send(`<!doctype html>
  <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pawpaw Veterinary Clinic</title><style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f6b5c;color:#123d33;font:16px/1.5 system-ui,sans-serif}
  main{width:min(92vw,560px);padding:48px 36px;text-align:center;background:#fff;border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,.2)}
  h1{margin:0 0 12px;font-size:clamp(2rem,7vw,3rem)}p{margin:0 0 28px;color:#59665d}
  a{display:inline-block;padding:12px 28px;border-radius:10px;background:#0f6b5c;color:#fff;text-decoration:none;font-weight:700}
  a:focus-visible{outline:3px solid #f2d64f;outline-offset:3px}
  </style></head><body><main><h1>Pawpaw Veterinary Clinic</h1>
  <p>Care and clinic services for your pets.</p><a href="/pages/auth/login.html">Log in</a></main></body></html>`));
app.use('/assets', express.static(path.join(webRoot, 'assets')));
app.use('/css', express.static(path.join(webRoot, 'css')));
app.use('/js', express.static(path.join(webRoot, 'js')));
app.use('/pages', express.static(path.join(webRoot, 'pages')));

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, _req, res, _next) => {
  console.error('Request failed:', error);
  if (error.code === '23505') return res.status(409).json({ error: 'A record with that username, email, license, or name already exists.' });
  if (error.code === '23503' || error.code === '23514') return res.status(400).json({ error: 'The requested change conflicts with related clinic records.' });
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'The request could not be completed.' });
});

module.exports = app;
