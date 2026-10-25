const express = require('express');
const db = require('../config/db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT notification_id AS id, notification_type AS type, title,
              message AS text, created_at AS "createdAt", read_at AS "readAt"
       FROM notification
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.auth.userId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Notification fetch failed:', error);
    res.status(500).json({ error: 'Could not load notifications.' });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE notification SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE notification_id = $1 AND user_id = $2
       RETURNING notification_id AS id`,
      [req.params.id, req.auth.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found.' });
    res.status(204).end();
  } catch (error) {
    console.error('Notification update failed:', error);
    res.status(500).json({ error: 'Could not update the notification.' });
  }
});

router.post('/read-all', async (req, res) => {
  try {
    await db.query(
      'UPDATE notification SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND read_at IS NULL',
      [req.auth.userId]
    );
    res.status(204).end();
  } catch (error) {
    console.error('Mark-all-read failed:', error);
    res.status(500).json({ error: 'Could not mark notifications as read.' });
  }
});

module.exports = router;
