const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../middleware/session');
const { ownOwner, ownPet } = require('../middleware/ownership');
const { createNotification, notifyRole, writeAudit } = require('../services/activity');

const STATUS_TO_DB = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  confirmed: 'Approved',
  approved: 'Approved',
  checked_in: 'Checked-in',
  'checked-in': 'Checked-in',
  with_vet: 'In Progress',
  'in progress': 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  no_show: 'No-show',
  'no-show': 'No-show'
};

function statusToClient(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'approved') return 'confirmed';
  if (normalized === 'checked-in') return 'checked_in';
  if (normalized === 'in progress') return 'with_vet';
  if (normalized === 'no-show') return 'no_show';
  return normalized;
}

function dateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = /^\d{4}-\d{2}-\d{2}/.exec(String(value || ''));
  return match ? match[0] : '';
}

const appointmentSelect = `
  SELECT a.appointment_id AS id,
         p.pet_id AS "petId",
         p.name AS "petName",
         o.owner_id AS "ownerId",
         o.name AS owner,
         o.name AS "ownerName",
         a.veterinarian_id AS "veterinarianId",
         v.name AS vet,
         a.appointment_date AS date,
         a.appointment_time AS time,
         a.reason,
         a.cancellation_reason AS "cancellationReason",
         a.reschedule_reason AS "rescheduleReason",
         CASE WHEN a.rescheduled_from_date IS NOT NULL THEN json_build_object(
           'date', a.rescheduled_from_date,
           'time', a.rescheduled_from_time
         ) ELSE NULL END AS "rescheduledFrom",
         a.status,
         EXISTS (SELECT 1 FROM medical_record mr WHERE mr.appointment_id = a.appointment_id) AS "hasRecord",
         COALESCE(
           json_agg(json_build_object(
             'id', s.service_id,
             'name', s.service_name,
             'price', s.price,
             'qty', aps.quantity
           )) FILTER (WHERE s.service_id IS NOT NULL),
           '[]'::json
         ) AS services,
         COALESCE(SUM(s.price * aps.quantity), 0) AS total
  FROM appointment a
  JOIN pet p ON p.pet_id = a.pet_id
  JOIN owner o ON o.owner_id = p.owner_id
  LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
  LEFT JOIN appointment_service aps ON aps.appointment_id = a.appointment_id
  LEFT JOIN service s ON s.service_id = aps.service_id
`;

function appendAppointmentGroups(sql) {
  return `${sql}
    GROUP BY a.appointment_id, p.pet_id, p.name, o.owner_id, o.name,
             a.veterinarian_id, v.name, a.appointment_date, a.appointment_time,
             a.reason, a.cancellation_reason, a.rescheduled_from_date,
             a.rescheduled_from_time, a.reschedule_reason, a.status`;
}

function normalizeAppointments(rows) {
  return rows.map((row) => ({
    ...row,
    status: statusToClient(row.status),
    vet: row.vet || 'To be assigned',
    declineReason: row.cancellationReason || null,
    total: Number(row.total) || 0
  }));
}

// @route   GET /api/appointments
// @desc    Get all appointments (with pet, owner, and vet details)
router.get('/', requireRole('staff', 'vet', 'admin'), async (req, res) => {
  try {
    const where = req.auth.role === 'vet' ? ' WHERE v.user_id = $1' : '';
    const query = `${appendAppointmentGroups(appointmentSelect + where)}
      ORDER BY a.appointment_date DESC, a.appointment_time DESC`;
    const result = await db.query(query, req.auth.role === 'vet' ? [req.auth.userId] : []);
    res.json(normalizeAppointments(result.rows));
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).json({ error: 'Server error while fetching appointments.' });
  }
});

// @route   GET /api/appointments/owner/:ownerId
// @desc    Get all appointments for a specific pet owner
router.get('/owner/:ownerId', requireRole('owner', 'staff', 'vet', 'admin'), ownOwner('ownerId'), async (req, res) => {
  const { ownerId } = req.params;
  try {
    const query = `${appendAppointmentGroups(`${appointmentSelect} WHERE o.owner_id = $1`)}
      ORDER BY a.appointment_date DESC, a.appointment_time DESC`;
    const result = await db.query(query, [ownerId]);
    res.json(normalizeAppointments(result.rows));
  } catch (err) {
    console.error('Error fetching owner appointments:', err);
    res.status(500).json({ error: 'Server error while fetching owner appointments.' });
  }
});

// @route   POST /api/appointments
// @desc    Book a new appointment
router.post('/', requireRole('owner', 'staff', 'admin'), ownPet('pet_id'), async (req, res) => {
  const petId = req.body.pet_id || req.body.petId;
  const appointmentDate = req.body.appointment_date || req.body.date;
  const appointmentTime = req.body.appointment_time || req.body.time;
  const reason = req.body.reason || null;
  const services = Array.isArray(req.body.services) ? req.body.services : [];
  let veterinarianId = req.body.veterinarian_id || req.body.veterinarianId || null;
  const vetName = req.body.vet || req.body.veterinarian_name;
  try {
    if (vetName && vetName !== 'To be assigned') {
      const vet = await db.query('SELECT veterinarian_id FROM veterinarian WHERE name = $1', [vetName]);
      if (vet.rows.length === 0) return res.status(400).json({ error: 'Veterinarian not found.' });
      veterinarianId = vet.rows[0].veterinarian_id;
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const initialStatus = req.auth.role === 'owner' ? 'Pending' : 'Approved';
      const aptResult = await client.query(
        `INSERT INTO appointment
           (pet_id, veterinarian_id, appointment_date, appointment_time, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING appointment_id`,
        [petId, veterinarianId, appointmentDate, appointmentTime, reason, initialStatus]
      );
      const appointmentId = aptResult.rows[0].appointment_id;

      for (const service of services) {
        let serviceId = service.service_id || service.serviceId || service.id;
        const quantity = Number(service.quantity || service.qty || 1);
        const serviceName = service.service_name || service.name;
        if (!serviceId && serviceName) {
          const serviceResult = await client.query(
            'SELECT service_id FROM service WHERE LOWER(service_name) = LOWER($1)',
            [serviceName]
          );
          serviceId = serviceResult.rows[0] && serviceResult.rows[0].service_id;
        }
        if (!serviceId || !Number.isInteger(quantity) || quantity < 1) {
          throw new Error('Appointment services must include a configured service and a valid quantity.');
        }
        await client.query(
          `INSERT INTO appointment_service (appointment_id, service_id, quantity)
           VALUES ($1, $2, $3)`,
          [appointmentId, serviceId, quantity]
        );
      }

      const appointment = await client.query(
        `SELECT p.name AS pet_name, o.name AS owner_name, o.user_id AS owner_user_id,
                v.user_id AS veterinarian_user_id, a.appointment_date, a.appointment_time
         FROM appointment a
         JOIN pet p ON p.pet_id = a.pet_id
         JOIN owner o ON o.owner_id = p.owner_id
         LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
         WHERE a.appointment_id = $1`,
        [appointmentId]
      );
      const booked = appointment.rows[0];
      const when = `${booked.pet_name} — ${booked.appointment_date} ${booked.appointment_time}`;
      if (req.auth.role === 'owner') {
        await notifyRole(client, 'Staff', 'appointment', 'New appointment request', `${booked.owner_name} requested an appointment for ${when}.`);
      } else {
        await createNotification(client, booked.owner_user_id, 'appointment', 'Appointment booked', when);
      }
      if (booked.veterinarian_user_id) {
        await createNotification(client, booked.veterinarian_user_id, 'appointment', 'New appointment request', when);
      }
      await writeAudit(client, req.auth.userId, 'create', 'appointment', appointmentId, `Requested an appointment for ${when}.`);
      await client.query('COMMIT');
      res.status(201).json({ message: 'Appointment booked successfully!', appointmentId });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23503' && error.constraint === 'fk_appointment_pet') {
        return res.status(400).json({ error: 'The selected pet is no longer available. Refresh your pets and try again.' });
      }
      if (error.code === '23503' && error.constraint === 'fk_appointment_service_service') {
        return res.status(400).json({ error: 'A selected service is no longer available. Refresh the services and try again.' });
      }
      if (error.code === '23503' && error.constraint === 'fk_appointment_veterinarian') {
        return res.status(400).json({ error: 'The selected veterinarian is no longer available. Choose another veterinarian.' });
      }
      if (error.code === '23514' && error.constraint === 'appointment_service_quantity_check') {
        return res.status(400).json({ error: 'Each selected service must have a valid quantity.' });
      }
      if (error.code) throw error;
      return res.status(400).json({ error: error.message });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error booking appointment:', err);
    res.status(500).json({ error: 'Server error during appointment booking.' });
  }
});

async function updateAppointment(req, res) {
  const { id } = req.params;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT a.appointment_id, a.status, a.appointment_date, a.appointment_time,
              a.veterinarian_id, a.cancellation_reason,
              p.pet_id, p.name AS pet_name, o.owner_id, o.user_id AS owner_user_id,
              o.name AS owner_name, v.user_id AS veterinarian_user_id
       FROM appointment a
       JOIN pet p ON p.pet_id = a.pet_id
       JOIN owner o ON o.owner_id = p.owner_id
       LEFT JOIN veterinarian v ON v.veterinarian_id = a.veterinarian_id
       WHERE a.appointment_id = $1
       FOR UPDATE OF a`,
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    const role = req.auth.role;
    const currentStatus = statusToClient(current.status);
    const changingSchedule = Object.prototype.hasOwnProperty.call(req.body, 'date') ||
      Object.prototype.hasOwnProperty.call(req.body, 'time');
    if (role === 'owner') {
      if (String(current.owner_user_id) !== String(req.auth.userId)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You do not have access to this appointment.' });
      }
      if (!['pending', 'confirmed'].includes(currentStatus) || dateOnly(current.appointment_date) < new Date().toISOString().slice(0, 10)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This appointment can no longer be changed.' });
      }
      if (!changingSchedule && String(req.body.status || '').toLowerCase() !== 'cancelled') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Owners may only cancel or reschedule appointments.' });
      }
      if (changingSchedule && (!req.body.date || !req.body.time)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Choose both a new date and time.' });
      }
    } else if (role === 'vet' && String(current.veterinarian_user_id) !== String(req.auth.userId)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only update appointments assigned to you.' });
    }

    const assignments = [];
    const values = [];
    const add = (column, value) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    const patch = { ...req.body };
    if (patch.declineReason && !patch.cancellationReason) patch.cancellationReason = patch.declineReason;
    if (role === 'owner' && changingSchedule) {
      patch.status = 'pending';
      patch.rescheduledFromDate = dateOnly(current.appointment_date);
      patch.rescheduledFromTime = current.appointment_time;
    } else if (role !== 'owner' && changingSchedule) {
      patch.rescheduledFromDate = dateOnly(current.appointment_date);
      patch.rescheduledFromTime = current.appointment_time;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
      const status = STATUS_TO_DB[String(patch.status || '').trim().toLowerCase()];
      if (!status) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid appointment status.' });
      }
      if (role === 'owner' && !['cancelled', 'pending'].includes(String(patch.status).toLowerCase())) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Owners cannot set this appointment status.' });
      }
      add('status', status);
    }

    if (role !== 'owner' && (Object.prototype.hasOwnProperty.call(patch, 'vet') ||
        Object.prototype.hasOwnProperty.call(patch, 'veterinarian_id'))) {
      let veterinarianId = patch.veterinarian_id || null;
      const vetName = patch.vet || patch.veterinarian_name;
      if (vetName && vetName !== 'To be assigned') {
        const veterinarian = await db.query(
          'SELECT veterinarian_id FROM veterinarian WHERE name = $1',
          [vetName]
        );
        if (veterinarian.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Veterinarian not found.' });
        }
        veterinarianId = veterinarian.rows[0].veterinarian_id;
      }
      add('veterinarian_id', veterinarianId);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'date')) add('appointment_date', patch.date);
    if (Object.prototype.hasOwnProperty.call(patch, 'time')) add('appointment_time', patch.time);
    if (Object.prototype.hasOwnProperty.call(patch, 'cancellationReason') && role !== 'owner') {
      add('cancellation_reason', patch.cancellationReason || null);
    }
    if (patch.status && String(patch.status).toLowerCase() === 'cancelled') {
      add('cancellation_reason', patch.cancellationReason || null);
    }
    if (patch.rescheduledFromDate) add('rescheduled_from_date', patch.rescheduledFromDate);
    if (patch.rescheduledFromTime) add('rescheduled_from_time', patch.rescheduledFromTime);
    if (Object.prototype.hasOwnProperty.call(patch, 'rescheduleReason') || changingSchedule) {
      add('reschedule_reason', patch.rescheduleReason || null);
    }
    if (assignments.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No appointment changes were provided.' });
    }

    values.push(id);
    const result = await client.query(
      `UPDATE appointment
       SET ${assignments.join(', ')}, updated_date = CURRENT_TIMESTAMP
       WHERE appointment_id = $${values.length}
       RETURNING appointment_id AS id, status`,
      values
    );

    const afterStatus = statusToClient(result.rows[0].status);
    const eventText = `${current.pet_name} — ${dateOnly(patch.date || current.appointment_date)} ${patch.time || current.appointment_time}`;
    const title = changingSchedule ? 'Appointment rescheduled' :
      afterStatus === 'cancelled' ? 'Appointment cancelled' :
      afterStatus === 'confirmed' ? 'Appointment approved' : 'Appointment updated';
    if (role !== 'owner') {
      await createNotification(client, current.owner_user_id, 'appointment', title, eventText);
    }
    if (role === 'owner') {
      await notifyRole(client, 'Staff', 'appointment', title, `${current.owner_name}: ${eventText}`);
      if (current.veterinarian_user_id) {
        await createNotification(client, current.veterinarian_user_id, 'appointment', title, eventText);
      }
    }
    await writeAudit(client, req.auth.userId, 'update', 'appointment', id, `${title}: ${eventText}.`);
    await client.query('COMMIT');

    res.json({
      message: 'Appointment updated successfully!',
      appointment: { ...result.rows[0], status: afterStatus }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error updating appointment:', err);
    res.status(500).json({ error: 'Server error while updating appointment.' });
  } finally {
    client.release();
  }
}

router.put('/:id/status', requireRole('staff', 'vet', 'admin'), updateAppointment);
router.patch('/:id/status', requireRole('staff', 'vet', 'admin'), updateAppointment);
router.patch('/:id', requireRole('owner', 'staff', 'vet', 'admin'), updateAppointment);

module.exports = router;