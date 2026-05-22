const express = require('express');
const { getDb } = require('../db/init');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const streams = db.prepare('SELECT id, name FROM streams WHERE user_id = ?').all(req.user.id);
    const result = streams.map(s => {
      const latest = db.prepare(`
        SELECT viewer_count, bitrate, fps, bandwidth, timestamp
        FROM analytics_events WHERE stream_id = ? ORDER BY timestamp DESC LIMIT 1
      `).get(s.id);
      const totals = db.prepare(`
        SELECT COUNT(*) as events,
               AVG(viewer_count) as avg_viewers,
               MAX(viewer_count) as peak_viewers,
               AVG(bitrate) as avg_bitrate,
               SUM(bandwidth) as total_bandwidth
        FROM analytics_events WHERE stream_id = ?
      `).get(s.id);
      return { ...s, latest, ...totals };
    });
    res.json({ analytics: result });
  } catch (err) {
    console.error('[Analytics] List error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:streamId', (req, res) => {
  try {
    const db = getDb();
    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(req.params.streamId, req.user.id);
    if (!stream) return res.status(404).json({ error: 'Stream not found' });
    const { range } = req.query;
    let hours = 24;
    if (range === '1h') hours = 1;
    else if (range === '6h') hours = 6;
    else if (range === '7d') hours = 168;
    else if (range === '30d') hours = 720;
    const events = db.prepare(`
      SELECT viewer_count, bitrate, fps, bandwidth, timestamp
      FROM analytics_events
      WHERE stream_id = ? AND timestamp >= datetime('now', '-${hours} hours')
      ORDER BY timestamp ASC
    `).all(req.params.streamId);
    res.json({ streamId: req.params.streamId, range: hours + 'h', events });
  } catch (err) {
    console.error('[Analytics] Get error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
