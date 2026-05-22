const express = require('express');
const { getDb } = require('../db/init');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const recordings = db.prepare(`
      SELECT r.*, s.name as stream_name
      FROM recordings r
      JOIN streams s ON r.stream_id = s.id
      WHERE s.user_id = ?
      ORDER BY r.created_at DESC
    `).all(req.user.id);
    res.json({ recordings });
  } catch (err) {
    console.error('[Recordings] List error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const recording = db.prepare(`
      SELECT r.*, s.name as stream_name
      FROM recordings r
      JOIN streams s ON r.stream_id = s.id
      WHERE r.id = ? AND s.user_id = ?
    `).get(req.params.id, req.user.id);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    res.json({ recording });
  } catch (err) {
    console.error('[Recordings] Get error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const recording = db.prepare(`
      SELECT r.* FROM recordings r
      JOIN streams s ON r.stream_id = s.id
      WHERE r.id = ? AND s.user_id = ?
    `).get(req.params.id, req.user.id);
    if (!recording) return res.status(404).json({ error: 'Recording not found' });
    db.prepare('DELETE FROM recordings WHERE id = ?').run(req.params.id);
    res.json({ message: 'Recording deleted' });
  } catch (err) {
    console.error('[Recordings] Delete error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
