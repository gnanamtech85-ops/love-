/**
 * StreamCast - Stream Management Routes
 * 
 * Full CRUD for streams plus start/stop lifecycle controls.
 * Auto-generates stream keys, RTMP URLs, and SRT URLs on creation.
 * Broadcasts stream state changes via Socket.IO.
 * 
 * Routes:
 *   GET    /            - List all streams for authenticated user
 *   POST   /            - Create a new stream
 *   GET    /:id         - Get stream details with its destinations
 *   PUT    /:id         - Update stream settings
 *   DELETE /:id         - Delete stream and associated data
 *   POST   /:id/start   - Start streaming (set status to 'live')
 *   POST   /:id/stop    - Stop streaming (set status to 'offline')
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const authMiddleware = require('../middleware/auth');
const srtRelay = require('../engine/srt-relay');

const router = express.Router();

// All stream routes require authentication
router.use(authMiddleware);

// ─── GET / ──────────────────────────────────────────────────────────────────────
// Returns all streams belonging to the authenticated user, with destination counts.
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const streams = db.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM destinations d WHERE d.stream_id = s.id) as destination_count,
        (SELECT COUNT(*) FROM destinations d WHERE d.stream_id = s.id AND d.enabled = 1) as active_destinations
      FROM streams s 
      WHERE s.user_id = ? 
      ORDER BY s.created_at DESC
    `).all(req.user.id);

    streams.forEach(s => {
      s.hls_url = `/live/${s.stream_key}/index.m3u8`;
    });

    res.json({ streams });
  } catch (err) {
    console.error('[Streams] List error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to list streams.' });
  }
});

// ─── POST / ─────────────────────────────────────────────────────────────────────
// Creates a new stream with auto-generated stream key, RTMP URL, and SRT URL.
router.post('/', (req, res) => {
  try {
    const { name, description, region, srt_latency, recording_enabled } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Stream name is required.'
      });
    }

    const db = getDb();
    const id = uuidv4();
    const streamKey = uuidv4();
    const host = req.headers.host || 'localhost:3000';
    const rtmpUrl = `rtmp://${host.replace(/:.*$/, '')}:1935/live/${streamKey}`;
    const srtPort = srtRelay.getPortForStream(streamKey) || srtRelay.getNextPort() || 9000;
    const srtUrl = `srt://${host.replace(/:.*$/, '')}:${srtPort}?streamid=${streamKey}`;
    const hlsUrl = `/live/${streamKey}/index.m3u8`;

    db.prepare(`
      INSERT INTO streams (id, user_id, name, description, stream_key, rtmp_url, srt_url, srt_latency, status, region, recording_enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offline', ?, ?)
    `    ).run(
      id, req.user.id, name, description || '', streamKey, rtmpUrl, srtUrl,
      srt_latency || 120, region || 'us-east', recording_enabled ? 1 : 0
    );

    srtRelay.startRelayForStream(streamKey, srtPort);

    const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(id);
    stream.hls_url = hlsUrl;
    stream.ingest_url = `rtmp://${host.replace(/:.*$/, '')}:1935/live/${streamKey}`;

    console.log(`[Streams] Created stream "${name}" (${id}) for user ${req.user.id}`);

    res.status(201).json({
      message: 'Stream created successfully',
      stream
    });
  } catch (err) {
    console.error('[Streams] Create error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to create stream.' });
  }
});

// ─── GET /:id ───────────────────────────────────────────────────────────────────
// Returns a single stream with its destinations.
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Fetch associated destinations
    const destinations = db.prepare('SELECT * FROM destinations WHERE stream_id = ? ORDER BY created_at DESC').all(stream.id);

    // Fetch associated SRTLA bonds
    const bonds = db.prepare('SELECT * FROM srtla_bonds WHERE stream_id = ?').all(stream.id);

    stream.hls_url = `/live/${stream.stream_key}/index.m3u8`;

    res.json({
      stream: {
        ...stream,
        destinations,
        bonds
      }
    });
  } catch (err) {
    console.error('[Streams] Get error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to fetch stream.' });
  }
});

// ─── PUT /:id ───────────────────────────────────────────────────────────────────
// Updates stream settings: name, description, region, srt_latency, recording_enabled.
router.put('/:id', (req, res) => {
  try {
    const db = getDb();
    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const { name, description, region, srt_latency, recording_enabled } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (region !== undefined) { updates.push('region = ?'); params.push(region); }
    if (srt_latency !== undefined) { updates.push('srt_latency = ?'); params.push(srt_latency); }
    if (recording_enabled !== undefined) { updates.push('recording_enabled = ?'); params.push(recording_enabled ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE streams SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM streams WHERE id = ?').get(req.params.id);
    console.log(`[Streams] Updated stream "${updated.name}" (${req.params.id})`);

    res.json({ message: 'Stream updated', stream: updated });
  } catch (err) {
    console.error('[Streams] Update error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to update stream.' });
  }
});

// ─── DELETE /:id ────────────────────────────────────────────────────────────────
// Deletes a stream and all associated destinations (cascade).
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Delete destinations first, then the stream
    db.prepare('DELETE FROM destinations WHERE stream_id = ?').run(req.params.id);
    db.prepare('DELETE FROM srtla_bonds WHERE stream_id = ?').run(req.params.id);
    db.prepare('DELETE FROM recordings WHERE stream_id = ?').run(req.params.id);
    db.prepare('DELETE FROM analytics_events WHERE stream_id = ?').run(req.params.id);
    db.prepare('DELETE FROM streams WHERE id = ?').run(req.params.id);

    srtRelay.stopRelayForStream(stream.stream_key);

    console.log(`[Streams] Deleted stream "${stream.name}" (${req.params.id})`);

    res.json({ message: 'Stream deleted successfully' });
  } catch (err) {
    console.error('[Streams] Delete error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to delete stream.' });
  }
});

// ─── POST /:id/start ────────────────────────────────────────────────────────────
// Sets a stream's status to 'live' and starts health simulation.
// Broadcasts the event via Socket.IO to all connected monitoring clients.
router.post('/:id/start', (req, res) => {
  try {
    const db = getDb();
    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (stream.status === 'live') {
      return res.status(400).json({ error: 'Stream is already live' });
    }

    // Update status to live
    db.prepare("UPDATE streams SET status = 'live', updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    // Update all enabled destinations to 'connected' status
    db.prepare("UPDATE destinations SET status = 'connected' WHERE stream_id = ? AND enabled = 1").run(req.params.id);

    // Broadcast via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.of('/stream-monitor').emit('stream:started', {
        streamId: req.params.id,
        name: stream.name,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[Streams] Stream "${stream.name}" is now LIVE`);

    res.json({
      message: 'Stream started successfully',
      stream: { ...stream, status: 'live' }
    });
  } catch (err) {
    console.error('[Streams] Start error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to start stream.' });
  }
});

// ─── POST /:id/stop ─────────────────────────────────────────────────────────────
// Sets a stream's status to 'offline' and stops health simulation.
router.post('/:id/stop', (req, res) => {
  try {
    const db = getDb();
    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Update status to offline
    db.prepare("UPDATE streams SET status = 'offline', updated_at = datetime('now') WHERE id = ?").run(req.params.id);

    // Update all destinations to 'idle'
    db.prepare("UPDATE destinations SET status = 'idle' WHERE stream_id = ?").run(req.params.id);

    // Broadcast via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.of('/stream-monitor').emit('stream:stopped', {
        streamId: req.params.id,
        name: stream.name,
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[Streams] Stream "${stream.name}" is now OFFLINE`);

    res.json({
      message: 'Stream stopped',
      stream: { ...stream, status: 'offline' }
    });
  } catch (err) {
    console.error('[Streams] Stop error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to stop stream.' });
  }
});

module.exports = router;
