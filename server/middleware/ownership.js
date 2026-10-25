const db = require('../config/db');

function ownOwner(paramName) {
  return async (req, res, next) => {
    if (req.auth.role !== 'owner') return next();

    try {
      const result = await db.query(
        'SELECT owner_id FROM owner WHERE user_id = $1',
        [req.auth.userId]
      );
      const body = req.body || {};
      const requestedOwnerId = req.params[paramName] || body.owner_id || body.ownerId;
      if (!result.rows[0] || String(result.rows[0].owner_id) !== String(requestedOwnerId)) {
        return res.status(403).json({ error: 'You do not have access to this owner record.' });
      }
      req.auth.ownerId = result.rows[0].owner_id;
      next();
    } catch (error) {
      console.error('Owner access check failed:', error);
      res.status(500).json({ error: 'Could not verify owner access.' });
    }
  };
}

function ownPet(paramName) {
  return async (req, res, next) => {
    if (req.auth.role !== 'owner') return next();

    try {
      const body = req.body || {};
      const requestedPetId = req.params[paramName] ||
        body[paramName] ||
        (paramName === 'pet_id' ? body.petId : null);
      const result = await db.query(
        `SELECT p.pet_id, p.owner_id
         FROM pet p
         JOIN owner o ON o.owner_id = p.owner_id
         WHERE p.pet_id = $1 AND o.user_id = $2`,
        [requestedPetId, req.auth.userId]
      );
      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'You do not have access to this pet.' });
      }
      req.auth.ownerId = result.rows[0].owner_id;
      next();
    } catch (error) {
      console.error('Pet access check failed:', error);
      res.status(500).json({ error: 'Could not verify pet access.' });
    }
  };
}

module.exports = { ownOwner, ownPet };
