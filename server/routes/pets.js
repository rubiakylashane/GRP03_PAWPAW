const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireRole } = require('../middleware/session');
const { ownOwner, ownPet } = require('../middleware/ownership');
const { writeAudit } = require('../services/activity');

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value &&
    value <= new Date().toISOString().slice(0, 10);
}

// @route   GET /api/pets/owner/:ownerId
// @desc    Get all pets belonging to a specific owner
router.get('/owner/:ownerId', ownOwner('ownerId'), async (req, res) => {
  const { ownerId } = req.params;

  try {
    const result = await db.query(
      `SELECT pet_id AS id, owner_id AS "ownerId", name, species, breed,
              gender AS sex, date_of_birth AS dob, allergies, notes, photo
       FROM pet WHERE owner_id = $1 ORDER BY pet_id ASC`,
      [ownerId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pets:', err);
    res.status(500).json({ error: 'Server error while fetching pets.' });
  }
});

// @route   POST /api/pets
// @desc    Register a new pet for an owner
router.post('/', requireRole('owner', 'staff', 'admin'), ownOwner('owner_id'), async (req, res) => {
  const { owner_id, name, species, breed, date_of_birth, gender } = req.body;
  if (!owner_id || !String(name || '').trim() || !String(species || '').trim() ||
      !String(breed || '').trim() || !['Male', 'Female'].includes(gender) ||
      (date_of_birth !== null && date_of_birth !== undefined && !validDate(date_of_birth))) {
    return res.status(400).json({ error: 'Enter a valid owner, pet name, species, breed, and gender.' });
  }

  try {
    const result = await db.query(
      `INSERT INTO pet (owner_id, name, species, breed, date_of_birth, gender, allergies, notes, photo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING pet_id AS id, owner_id AS "ownerId", name, species, breed,
                 gender AS sex, date_of_birth AS dob, allergies, notes, photo`,
      [owner_id, String(name).trim(), String(species).trim(), String(breed).trim(), date_of_birth, gender,
        req.body.allergies || null, req.body.notes || null, req.body.photo || null]
    );

    res.status(201).json({
      message: 'Pet registered successfully!',
      pet: result.rows[0]
    });
  } catch (err) {
    console.error('Error registering pet:', err);
    res.status(500).json({ error: 'Server error during pet registration.' });
  }
});

router.put('/:id', requireRole('owner', 'staff', 'admin'), ownPet('id'), async (req, res) => {
  const { id } = req.params;
  const { name, species, breed, date_of_birth, gender, allergies, notes, photo } = req.body;
  if ((name !== undefined && !String(name || '').trim()) ||
      (species !== undefined && !String(species || '').trim()) ||
      (breed !== undefined && !String(breed || '').trim()) ||
      (date_of_birth !== undefined && date_of_birth !== null && !validDate(date_of_birth)) ||
      (gender !== undefined && !['Male', 'Female'].includes(gender))) {
    return res.status(400).json({ error: 'Enter valid pet details.' });
  }

  try {
    const result = await db.query(
      `UPDATE pet
       SET name = COALESCE($1, name),
           species = COALESCE($2, species),
           breed = COALESCE($3, breed),
           date_of_birth = CASE WHEN $10 THEN $4 ELSE date_of_birth END,
           gender = COALESCE($5, gender),
           allergies = COALESCE($6, allergies),
           notes = COALESCE($7, notes),
           photo = COALESCE($8, photo)
       WHERE pet_id = $9
       RETURNING pet_id AS id, owner_id AS "ownerId", name, species, breed,
                 gender AS sex, date_of_birth AS dob, allergies, notes, photo`,
      [name, species, breed, date_of_birth, gender, allergies, notes, photo, id,
        Object.prototype.hasOwnProperty.call(req.body, 'date_of_birth')]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pet not found.' });
    res.json({ pet: result.rows[0] });
  } catch (err) {
    console.error('Error updating pet:', err);
    res.status(500).json({ error: 'Server error while updating pet.' });
  }
});

router.delete('/:id', requireRole('owner', 'staff', 'admin'), ownPet('id'), async (req, res) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const pet = await client.query(
      `SELECT p.pet_id, p.name, p.owner_id
       FROM pet p WHERE p.pet_id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (!pet.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pet not found.' });
    }
    const history = await client.query(
      `SELECT
         EXISTS (SELECT 1 FROM appointment WHERE pet_id = $1) OR
         EXISTS (SELECT 1 FROM vaccination WHERE pet_id = $1) AS has_history`,
      [req.params.id]
    );
    if (history.rows[0].has_history) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This pet has appointment or vaccination history and cannot be deleted.' });
    }
    await writeAudit(client, req.auth.userId, 'delete', 'pet', req.params.id, `Removed pet ${pet.rows[0].name}.`);
    await client.query('DELETE FROM pet WHERE pet_id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting pet:', err);
    res.status(500).json({ error: 'Server error while deleting pet.' });
  } finally {
    client.release();
  }
});

module.exports = router;