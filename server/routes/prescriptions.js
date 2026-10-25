const express = require('express');
const db = require('../config/db');
const { requireRole } = require('../middleware/session');

const router = express.Router();

router.get('/', requireRole('owner'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT pr.prescription_id AS id, p.name AS pet, p.pet_id AS "petId",
              mr.record_date AS date, pr.medication_name AS medication,
              pr.dosage AS dose, pr.instructions, pr.quantity
       FROM prescription pr
       JOIN medical_record mr ON mr.record_id = pr.record_id
       JOIN appointment a ON a.appointment_id = mr.appointment_id
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       WHERE o.user_id = $1
       ORDER BY mr.record_date DESC, pr.prescription_id DESC`,
      [req.auth.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Prescription list failed:', error);
    res.status(500).json({ error: 'Could not load prescriptions.' });
  }
});

module.exports = router;
