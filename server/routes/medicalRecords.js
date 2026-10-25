const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../middleware/session');
const { ownPet } = require('../middleware/ownership');
const { createNotification, writeAudit } = require('../services/activity');

router.get('/', requireRole('owner'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT mr.record_id AS id, p.name AS pet, p.pet_id AS "petId",
              mr.record_date AS date, mr.diagnosis, mr.treatment, mr.notes,
              v.name AS veterinarian
       FROM medical_record mr
       JOIN appointment a ON a.appointment_id = mr.appointment_id
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       WHERE o.user_id = $1
       ORDER BY mr.record_date DESC, mr.record_id DESC`,
      [req.auth.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Medical-record list failed:', error);
    res.status(500).json({ error: 'Could not load medical records.' });
  }
});

router.get('/all', requireRole('staff', 'vet', 'admin'), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT mr.record_id AS id, mr.appointment_id AS "appointmentId",
              mr.record_date AS date, mr.diagnosis, mr.treatment, mr.notes,
              mr.services, a.pet_id AS "petId", p.name AS pet,
              o.owner_id AS "ownerId", o.name AS owner, v.name AS veterinarian,
              COALESCE(json_agg(json_build_object(
                'id', rx.prescription_id,
                'medication', rx.medication_name,
                'dose', rx.dosage,
                'instructions', rx.instructions,
                'quantity', rx.quantity
              )) FILTER (WHERE rx.prescription_id IS NOT NULL), '[]'::json) AS prescriptions
       FROM medical_record mr
       JOIN appointment a ON a.appointment_id = mr.appointment_id
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       LEFT JOIN prescription rx ON rx.record_id = mr.record_id
       WHERE ($1 <> 'vet' OR v.user_id = $2)
       GROUP BY mr.record_id, a.appointment_id, a.pet_id, p.name, o.owner_id, o.name, v.name
       ORDER BY mr.record_date DESC, mr.record_id DESC`,
      [req.auth.role, req.auth.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Clinical record list failed:', error);
    res.status(500).json({ error: 'Could not load medical records.' });
  }
});

// @route   GET /api/medical-records/pet/:petId
// @desc    Get all medical records, treatments, and prescriptions for a specific pet
router.get('/pet/:petId', requireRole('owner', 'staff', 'vet', 'admin'), ownPet('petId'), async (req, res) => {
  const { petId } = req.params;

  try {
    // 1. Fetch medical records linked through appointments for this pet
    const recordsResult = await db.query(`
      SELECT mr.*, a.appointment_date, v.name AS veterinarian_name
      FROM medical_record mr
      JOIN appointment a ON mr.appointment_id = a.appointment_id
      LEFT JOIN veterinarian v ON a.veterinarian_id = v.veterinarian_id
      WHERE a.pet_id = $1
      ORDER BY mr.record_date DESC
    `, [petId]);

    // 2. For each record, fetch its associated prescriptions
    const records = [];
    for (let record of recordsResult.rows) {
      const prescResult = await db.query(
        'SELECT * FROM prescription WHERE record_id = $1',
        [record.record_id]
      );
      records.push({
        ...record,
        prescriptions: prescResult.rows
      });
    }

    res.json(records);
  } catch (err) {
    console.error('Error fetching medical records:', err);
    res.status(500).json({ error: 'Server error while fetching medical records.' });
  }
});

// @route   POST /api/medical-records
// @desc    Create a new medical record and optional prescriptions during consultation
router.post('/', requireRole('vet', 'staff', 'admin'), async (req, res) => {
  const { appointment_id, diagnosis, treatment, notes, prescriptions } = req.body;
  if (!appointment_id || !String(diagnosis || '').trim()) {
    return res.status(400).json({ error: 'An appointment and diagnosis are required.' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const appointment = await client.query(
      `SELECT a.pet_id, a.veterinarian_id, a.status, p.name AS pet_name,
              o.user_id AS owner_user_id, v.user_id AS veterinarian_user_id
       FROM appointment a
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       WHERE a.appointment_id = $1
       FOR UPDATE OF a`,
      [appointment_id]
    );
    const visit = appointment.rows[0];
    if (!visit) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Appointment not found.' });
    }
    if (req.auth.role === 'vet' && String(visit.veterinarian_user_id) !== String(req.auth.userId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only record visits assigned to you.' });
    }
    const recordResult = await client.query(
      `INSERT INTO medical_record (appointment_id, diagnosis, treatment, notes, record_date)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *`,
      [appointment_id, String(diagnosis).trim(), treatment || null, notes || null]
    );

    const newRecord = recordResult.rows[0];
    const createdPrescriptions = [];

    // 2. If prescriptions are provided, insert them into the prescription table
    if (prescriptions && Array.isArray(prescriptions)) {
      for (const p of prescriptions) {
        if (!String(p.medication_name || p.medication || '').trim() ||
            !String(p.dosage || p.dose || '').trim() ||
            !String(p.instructions || '').trim()) {
          throw new Error('Each prescription needs a medication, dosage, and instructions.');
        }
        const prescResult = await client.query(
      `INSERT INTO prescription (record_id, medication_name, dosage, instructions, quantity)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [newRecord.record_id, p.medication_name || p.medication, p.dosage || p.dose, p.instructions, p.quantity || 1]
        );
        createdPrescriptions.push(prescResult.rows[0]);
      }
    }

    await client.query(
      `UPDATE appointment SET status = 'Completed', updated_date = CURRENT_TIMESTAMP
       WHERE appointment_id = $1`,
      [appointment_id]
    );
    await createNotification(client, visit.owner_user_id, 'record', 'Medical record ready', `${visit.pet_name}'s visit record is available.`);
    await writeAudit(client, req.auth.userId, 'create', 'medical_record', newRecord.record_id, `Created a medical record for ${visit.pet_name}.`);
    await client.query('COMMIT');

    res.status(201).json({
      message: 'Medical record and prescriptions saved successfully!',
      medical_record: newRecord,
      prescriptions: createdPrescriptions
    });

    router.post('/appointments/:appointmentId/complete', requireRole('vet', 'staff', 'admin'), async (req, res) => {
      const { appointmentId } = req.params;
      const { diagnosis, treatment, notes } = req.body;
      const recordDate = req.body.recordDate || new Date().toISOString().slice(0, 10);
      const prescriptions = Array.isArray(req.body.prescriptions) ? req.body.prescriptions : [];
      const vaccinations = Array.isArray(req.body.vaccinations) ? req.body.vaccinations : [];
      const services = Array.isArray(req.body.services) ? req.body.services : [];
      if (!String(diagnosis || '').trim()) return res.status(400).json({ error: 'A diagnosis is required.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || recordDate > new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ error: 'Use a valid record date that is not in the future.' });
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const appointment = await client.query(
          `SELECT a.appointment_id, a.pet_id, a.veterinarian_id, p.name AS pet_name,
                  o.user_id AS owner_user_id, v.user_id AS veterinarian_user_id, v.name AS veterinarian_name
           FROM appointment a
           JOIN pet p ON p.pet_id = a.pet_id
           JOIN owner o ON o.owner_id = p.owner_id
           LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
           WHERE a.appointment_id = $1
           FOR UPDATE OF a`,
          [appointmentId]
        );
        const visit = appointment.rows[0];
        if (!visit) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Appointment not found.' });
        }
        if (req.auth.role === 'vet' && String(visit.veterinarian_user_id) !== String(req.auth.userId)) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'You can only complete visits assigned to you.' });
        }
        for (const vaccine of vaccinations) {
          if (!String(vaccine.name || '').trim() || !vaccine.dateAdministered ||
              (vaccine.nextDue && vaccine.nextDue <= vaccine.dateAdministered)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Each vaccine needs a name, administration date, and valid next-due date.' });
          }
        }

        const recordResult = await client.query(
          `INSERT INTO medical_record (appointment_id, diagnosis, treatment, notes, record_date, services)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (appointment_id) DO UPDATE
           SET diagnosis = EXCLUDED.diagnosis, treatment = EXCLUDED.treatment,
               notes = EXCLUDED.notes, record_date = EXCLUDED.record_date,
               services = EXCLUDED.services
           RETURNING *`,
          [appointmentId, String(diagnosis).trim(), treatment || null, notes || null, recordDate, JSON.stringify(services)]
        );
        const record = recordResult.rows[0];
        await client.query('DELETE FROM prescription WHERE record_id = $1', [record.record_id]);
        for (const prescription of prescriptions) {
          const medication = String(prescription.medication_name || prescription.medication || '').trim();
          const quantity = Number(prescription.quantity || 1);
          if (!medication || !Number.isInteger(quantity) || quantity < 1) {
            throw new Error('Each prescription needs a medication and a positive whole-number quantity.');
          }
          await client.query(
            `INSERT INTO prescription (record_id, medication_name, dosage, instructions, quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [record.record_id, medication, prescription.dosage || prescription.dose || null,
              prescription.instructions || null, quantity]
          );
        }
        await client.query('DELETE FROM vaccination WHERE appointment_id = $1', [appointmentId]);
        for (const vaccine of vaccinations) {
          await client.query(
            `INSERT INTO vaccination
               (appointment_id, pet_id, vaccine_type, date_administered, next_due_date,
                veterinarian_id, administered_by, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [appointmentId, visit.pet_id, String(vaccine.name).trim(), vaccine.dateAdministered,
              vaccine.nextDue || null, visit.veterinarian_id, visit.veterinarian_name || null, vaccine.notes || null]
          );
        }
        await client.query(
          `UPDATE appointment SET status = 'Completed', updated_date = CURRENT_TIMESTAMP
           WHERE appointment_id = $1`,
          [appointmentId]
        );
        await createNotification(client, visit.owner_user_id, 'record', 'Medical record ready', `${visit.pet_name}'s visit record is available.`);
        if (vaccinations.length) {
          await createNotification(client, visit.owner_user_id, 'record', 'Vaccination recorded',
            `${vaccinations.map((item) => String(item.name).trim()).join(', ')} recorded for ${visit.pet_name}.`);
        }
        await writeAudit(client, req.auth.userId, 'update', 'medical_record', record.record_id,
          `Completed and saved the visit record for ${visit.pet_name}.`);
        await client.query('COMMIT');
        res.status(200).json({ record });
      } catch (error) {
        await client.query('ROLLBACK');
        if (!error.code) return res.status(400).json({ error: error.message });
        console.error('Visit completion failed:', error);
        res.status(500).json({ error: 'Could not save the completed visit.' });
      } finally {
        client.release();
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.message && !err.code) return res.status(400).json({ error: err.message });
    console.error('Error saving medical record:', err);
    res.status(500).json({ error: 'Server error during medical record creation.' });
  } finally {
    client.release();
  }
});

module.exports = router;