const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../middleware/session');
const { writeAudit } = require('../services/activity');

// @route   GET /api/services
// @desc    Get all available clinic services and pricing
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT service_id AS id, service_name AS name,
              description AS desc, price
       FROM service ORDER BY service_id ASC`
    );
    result.rows.forEach((service) => { service.price = Number(service.price); });
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: 'Server error while fetching services.' });
  }
});

// @route   POST /api/services
// @desc    Add a new clinic service (Admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  const service_name = req.body.service_name || req.body.name;
  const description = req.body.description || req.body.desc;
  const { price } = req.body;
  if (!String(service_name || '').trim() || !Number.isFinite(Number(price)) || Number(price) <= 0) {
    return res.status(400).json({ error: 'Enter a service name and a price greater than zero.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO service (service_name, description, price)
       VALUES ($1, $2, $3)
       RETURNING service_id AS id, service_name AS name, description AS desc, price`,
      [service_name, description, price]
    );

    await writeAudit(db, req.auth.userId, 'create', 'service', result.rows[0].id,
      `Added service ${result.rows[0].name}.`);
    res.status(201).json({
      message: 'Service created successfully!',
      service: { ...result.rows[0], price: Number(result.rows[0].price) }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A service with that name already exists.' });
    }
    console.error('Error creating service:', err);
    res.status(500).json({ error: 'Server error during service creation.' });
  }
});

// @route   PUT /api/services/:id
// @desc    Update service pricing or details (Admin only)
router.put('/:id', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const service_name = req.body.service_name || req.body.name;
  const description = req.body.description || req.body.desc;
  const { price } = req.body;
  if ((service_name !== undefined && !String(service_name || '').trim()) ||
      (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) <= 0))) {
    return res.status(400).json({ error: 'Enter a valid service name and price greater than zero.' });
  }

  try {
    const result = await db.query(
      `UPDATE service 
       SET service_name = COALESCE($1, service_name),
           description = COALESCE($2, description),
           price = COALESCE($3, price)
       WHERE service_id = $4
       RETURNING service_id AS id, service_name AS name, description AS desc, price`,
      [service_name, description, price, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found.' });
    }

    await writeAudit(db, req.auth.userId, 'update', 'service', id,
      `Updated service ${result.rows[0].name}.`);
    res.json({
      message: 'Service updated successfully!',
      service: { ...result.rows[0], price: Number(result.rows[0].price) }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A service with that name already exists.' });
    }
    console.error('Error updating service:', err);
    res.status(500).json({ error: 'Server error while updating service.' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    const usage = await db.query(
      'SELECT 1 FROM appointment_service WHERE service_id = $1 LIMIT 1',
      [req.params.id]
    );
    if (usage.rows.length > 0) {
      return res.status(409).json({ error: 'This service is used in an appointment and cannot be deleted.' });
    }

    const result = await db.query(
      'DELETE FROM service WHERE service_id = $1 RETURNING service_id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Service not found.' });
    await writeAudit(db, req.auth.userId, 'delete', 'service', req.params.id,
      `Deleted service ${req.params.id}.`);
    res.status(204).end();
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).json({ error: 'Server error while deleting service.' });
  }
});

module.exports = router;