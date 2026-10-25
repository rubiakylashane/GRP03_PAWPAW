const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../middleware/session');
const { ownPet } = require('../middleware/ownership');
const { createNotification, writeAudit } = require('../services/activity');

router.get('/', requireRole('owner'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.vaccination_id AS id, v.pet_id AS "petId", p.name AS pet,
              v.vaccine_type AS vaccine, v.date_administered AS "dateAdministered",
              v.next_due_date AS "nextDue",
              COALESCE(v.administered_by, vet.name) AS "administeredBy", v.notes
       FROM vaccination v
       JOIN pet p ON p.pet_id = v.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       LEFT JOIN veterinarian vet ON vet.veterinarian_id = v.veterinarian_id
       WHERE o.user_id = $1
       ORDER BY v.date_administered DESC`,
      [req.auth.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Owner vaccination list failed:', error);
    res.status(500).json({ error: 'Could not load vaccination records.' });
  }
});

router.get('/reminders', requireRole('staff', 'vet', 'admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.vaccination_id AS id, v.pet_id AS "petId", p.name AS pet,
              o.owner_id AS "ownerId", o.name AS owner, o.phone,
              v.vaccine_type AS vaccine, v.date_administered AS "dateAdministered",
              v.next_due_date AS "nextDue", v.last_reminded_at AS "lastRemindedAt"
       FROM vaccination v
       JOIN pet p ON p.pet_id = v.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       LEFT JOIN veterinarian administered_vet ON administered_vet.veterinarian_id = v.veterinarian_id
       LEFT JOIN appointment a ON a.appointment_id = v.appointment_id
       LEFT JOIN veterinarian appointment_vet ON appointment_vet.veterinarian_id = a.veterinarian_id
       WHERE v.next_due_date IS NOT NULL
         AND ($1 <> 'vet' OR COALESCE(appointment_vet.user_id, administered_vet.user_id) = $2)
       ORDER BY v.next_due_date ASC, v.vaccination_id ASC`,
      [req.auth.role, req.auth.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Vaccination reminder list failed:', error);
    res.status(500).json({ error: 'Could not load vaccination reminders.' });
  }
});

router.get('/clinical', requireRole('staff', 'vet', 'admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.vaccination_id AS id, v.pet_id AS "petId", p.name AS pet,
              o.owner_id AS "ownerId", o.name AS owner,
              v.vaccine_type AS vaccine, v.date_administered AS "dateAdministered",
              v.next_due_date AS "nextDue",
              COALESCE(v.administered_by, administered_vet.name, appointment_vet.name) AS "administeredBy",
              v.notes
       FROM vaccination v
       JOIN pet p ON p.pet_id = v.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       LEFT JOIN veterinarian administered_vet ON administered_vet.veterinarian_id = v.veterinarian_id
       LEFT JOIN appointment a ON a.appointment_id = v.appointment_id
       LEFT JOIN veterinarian appointment_vet ON appointment_vet.veterinarian_id = a.veterinarian_id
       WHERE ($1 <> 'vet' OR COALESCE(administered_vet.user_id, appointment_vet.user_id) = $2)
       ORDER BY v.date_administered DESC, v.vaccination_id DESC`,
      [req.auth.role, req.auth.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Clinical vaccination list failed:', error);
    res.status(500).json({ error: 'Could not load vaccination records.' });
  }
});

router.post('/reminders/:id/notify', requireRole('staff', 'admin'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT v.vaccination_id, v.vaccine_type, v.next_due_date, p.name AS pet_name,
              o.user_id AS owner_user_id, o.name AS owner_name
       FROM vaccination v
       JOIN pet p ON p.pet_id = v.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       WHERE v.vaccination_id = $1
       FOR UPDATE OF v`,
      [req.params.id]
    );
    const vaccination = result.rows[0];
    if (!vaccination) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vaccination reminder not found.' });
    }
    await createNotification(client, vaccination.owner_user_id, 'reminder',
      `Vaccine reminder: ${vaccination.pet_name}`,
      `${vaccination.vaccine_type} is due on ${vaccination.next_due_date}. Please book an appointment to keep your pet protected.`);
    const updated = await client.query(
      `UPDATE vaccination SET last_reminded_at = CURRENT_TIMESTAMP
       WHERE vaccination_id = $1 RETURNING last_reminded_at AS "lastRemindedAt"`,
      [req.params.id]
    );
    await writeAudit(client, req.auth.userId, 'update', 'vaccination', req.params.id,
      `Sent a vaccine reminder for ${vaccination.pet_name}.`);
    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Vaccination reminder send failed:', error);
    res.status(500).json({ error: 'Could not send the vaccination reminder.' });
  } finally {
    client.release();
  }
});

// @route   GET /api/vaccinations/pet/:petId
// @desc    Get all vaccination records for a specific pet
router.get('/pet/:petId', requireRole('owner', 'staff', 'vet', 'admin'), ownPet('petId'), async (req, res) => {
  const { petId } = req.params;

  try {
    const result = await db.query(
      `SELECT v.vaccination_id AS id,
              v.appointment_id AS "appointmentId",
              v.pet_id AS "petId",
              p.name AS pet,
              v.vaccine_type AS vaccine,
              v.date_administered AS "dateAdministered",
              v.next_due_date AS "nextDue",
              COALESCE(v.administered_by, vet.name) AS "administeredBy",
              v.notes
       FROM vaccination v
       JOIN pet p ON p.pet_id = v.pet_id
       LEFT JOIN veterinarian vet ON vet.veterinarian_id = v.veterinarian_id
       WHERE v.pet_id = $1
       ORDER BY v.date_administered DESC`,
      [petId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching vaccination records:', err);
    res.status(500).json({ error: 'Server error while fetching vaccinations.' });
  }
});

// @route   POST /api/vaccinations
// @desc    Record a newly administered vaccine and next due date
router.post('/', requireRole('staff', 'vet', 'admin'), ownPet('pet_id'), async (req, res) => {
  const petId = req.body.pet_id || req.body.petId;
  const vaccine = req.body.vaccine_name || req.body.vaccine_type || req.body.vaccine;
  const dateAdministered = req.body.administration_date || req.body.date_administered || req.body.dateAdministered;
  const nextDue = req.body.next_due_date || req.body.nextDue || null;
  const administeredBy = req.body.administered_by || req.body.administeredBy || null;

  if (!petId || !String(vaccine || '').trim() || !dateAdministered) {
    return res.status(400).json({ error: 'A pet, vaccine name, and administration date are required.' });
  }
  if (String(dateAdministered) > new Date().toISOString().slice(0, 10) ||
      (nextDue && String(nextDue) <= String(dateAdministered))) {
    return res.status(400).json({ error: 'Use a valid administration date and a later next-due date.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const pet = await client.query(
      `SELECT p.name, o.user_id AS owner_user_id
       FROM pet p JOIN owner o ON o.owner_id = p.owner_id
       WHERE p.pet_id = $1`,
      [petId]
    );
    if (!pet.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pet not found.' });
    }
    const veterinarian = req.auth.role === 'vet'
      ? await client.query('SELECT veterinarian_id, name FROM veterinarian WHERE user_id = $1', [req.auth.userId])
      : { rows: [] };
    if (req.auth.role === 'vet') {
      const assigned = await client.query(
        `SELECT 1
         FROM appointment a
         JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
         WHERE a.pet_id = $1 AND v.user_id = $2 AND a.status <> 'Cancelled'
         LIMIT 1`,
        [petId, req.auth.userId]
      );
      if (!assigned.rows.length) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You can only record vaccinations for your assigned patients.' });
      }
    }
    const veterinarianId = req.body.veterinarian_id || (veterinarian.rows[0] && veterinarian.rows[0].veterinarian_id) || null;
    const recordedBy = administeredBy || (veterinarian.rows[0] && veterinarian.rows[0].name) || null;
    const result = await client.query(
      `INSERT INTO vaccination
         (pet_id, vaccine_type, date_administered, next_due_date, veterinarian_id, administered_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING vaccination_id AS id, pet_id AS "petId",
                 vaccine_type AS vaccine, date_administered AS "dateAdministered",
                 next_due_date AS "nextDue", administered_by AS "administeredBy", notes`,
      [petId, vaccine, dateAdministered, nextDue, veterinarianId, recordedBy, req.body.notes || null]
    );
    await createNotification(client, pet.rows[0].owner_user_id, 'record', 'Vaccination recorded',
      `${vaccine} was recorded for ${pet.rows[0].name}.`);
    await writeAudit(client, req.auth.userId, 'create', 'vaccination', result.rows[0].id, `Recorded ${vaccine} vaccination for ${pet.rows[0].name}.`);
    await client.query('COMMIT');

    res.status(201).json({
      message: 'Vaccination record saved successfully!',
      vaccination: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving vaccination record:', err);
    res.status(500).json({ error: 'Server error during vaccination recording.' });
  } finally {
    client.release();
  }
});

module.exports = router;