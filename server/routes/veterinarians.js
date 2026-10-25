const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middleware/session');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.veterinarian_id AS id, v.name, v.specialization
       FROM veterinarian v
       LEFT JOIN user_account ua ON ua.user_id = v.user_id
       WHERE v.user_id IS NULL OR ua.account_status = 'Active'
       ORDER BY v.name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Veterinarian list failed:', error);
    res.status(500).json({ error: 'Could not load veterinarians.' });
  }
});

router.get('/patients', requireRole('vet'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT ON (p.pet_id)
              o.owner_id AS "ownerId", p.pet_id AS "petId", p.name,
              p.species, p.breed, p.gender AS sex, p.date_of_birth AS dob,
              p.allergies, p.notes, p.photo, o.name AS "ownerName",
              o.phone AS "ownerPhone", o.email AS "ownerEmail"
       FROM appointment a
       JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       WHERE v.user_id = $1 AND a.status <> 'Cancelled'
       ORDER BY p.pet_id, a.appointment_date DESC`,
      [req.auth.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Veterinarian patient list failed:', error);
    res.status(500).json({ error: 'Could not load assigned patients.' });
  }
});

module.exports = router;
