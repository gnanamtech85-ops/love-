/**
 * StreamCast - SRTLA (SRT Link Aggregation) Routes
 * 
 * Manages SRTLA bonds and their network interfaces for resilient
 * mobile streaming. Supports aggregate, broadcast, and failover modes.
 * 
 * Routes:
 *   GET    /bonds                        - List all bonds for user's streams
 *   POST   /bonds                        - Create a new bond
 *   GET    /bonds/:id                    - Get bond with interfaces
 *   PUT    /bonds/:id                    - Update bond settings
 *   DELETE /bonds/:id                    - Delete bond
 *   GET    /bonds/:id/stats              - Get simulated real-time stats
 *   POST   /bonds/:id/interfaces         - Add interface to bond
 *   PUT    /bonds/:id/interfaces/:ifId   - Update interface
 *   DELETE /bonds/:id/interfaces/:ifId   - Remove interface
 *   GET    /srt/config                   - Get SRT latency presets
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const authMiddleware = require('../middleware/auth');
const srtlaManager = require('../engine/srtla-manager');

const router = express.Router();

// All SRTLA routes require authentication
router.use(authMiddleware);

// ─── GET /bonds ─────────────────────────────────────────────────────────────────
// Lists all SRTLA bonds for streams belonging to the authenticated user.
router.get('/bonds', (req, res) => {
  try {
    const db = getDb();

    // Get all bonds for user's streams, including interface counts
    const bonds = db.prepare(`
      SELECT b.*, s.name as stream_name,
        (SELECT COUNT(*) FROM srtla_interfaces i WHERE i.bond_id = b.id) as interface_count,
        (SELECT COUNT(*) FROM srtla_interfaces i WHERE i.bond_id = b.id AND i.enabled = 1) as active_interfaces
      FROM srtla_bonds b
      JOIN streams s ON b.stream_id = s.id
      WHERE s.user_id = ?
      ORDER BY b.created_at DESC
    `).all(req.user.id);

    res.json({ bonds });
  } catch (err) {
    console.error('[SRTLA] List bonds error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to list bonds.' });
  }
});

// ─── POST /bonds ────────────────────────────────────────────────────────────────
// Creates a new SRTLA bond for a given stream.
router.post('/bonds', (req, res) => {
  try {
    const { stream_id, name, mode, srt_latency, srt_overhead, srt_encryption, max_bandwidth } = req.body;
    const db = getDb();

    // Validate stream ownership
    if (!stream_id) {
      return res.status(400).json({ error: 'stream_id is required' });
    }

    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(stream_id, req.user.id);
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Bond name is required' });
    }

    // Validate mode
    const validModes = ['aggregate', 'broadcast', 'failover'];
    const bondMode = mode || 'aggregate';
    if (!validModes.includes(bondMode)) {
      return res.status(400).json({
        error: 'Invalid mode',
        message: `Mode must be one of: ${validModes.join(', ')}`
      });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO srtla_bonds (id, stream_id, name, mode, srt_latency, srt_overhead, srt_encryption, max_bandwidth, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idle')
    `).run(
      id, stream_id, name, bondMode,
      srt_latency || 120,
      srt_overhead || 25,
      srt_encryption || 'none',
      max_bandwidth || 0
    );

    const bond = db.prepare('SELECT * FROM srtla_bonds WHERE id = ?').get(id);
    console.log(`[SRTLA] Created bond "${name}" (${bondMode}) for stream ${stream_id}`);

    res.status(201).json({ message: 'Bond created', bond });
  } catch (err) {
    console.error('[SRTLA] Create bond error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to create bond.' });
  }
});

// ─── GET /bonds/:id ─────────────────────────────────────────────────────────────
// Returns a bond with all its interfaces.
router.get('/bonds/:id', (req, res) => {
  try {
    const db = getDb();

    // Verify ownership through stream
    const bond = db.prepare(`
      SELECT b.*, s.name as stream_name
      FROM srtla_bonds b
      JOIN streams s ON b.stream_id = s.id
      WHERE b.id = ? AND s.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!bond) {
      return res.status(404).json({ error: 'Bond not found' });
    }

    // Fetch interfaces
    const interfaces = db.prepare(
      'SELECT * FROM srtla_interfaces WHERE bond_id = ? ORDER BY priority ASC'
    ).all(req.params.id);

    res.json({
      bond: {
        ...bond,
        interfaces
      }
    });
  } catch (err) {
    console.error('[SRTLA] Get bond error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to fetch bond.' });
  }
});

// ─── PUT /bonds/:id ─────────────────────────────────────────────────────────────
// Updates bond settings.
router.put('/bonds/:id', (req, res) => {
  try {
    const db = getDb();

    const bond = db.prepare(`
      SELECT b.* FROM srtla_bonds b
      JOIN streams s ON b.stream_id = s.id
      WHERE b.id = ? AND s.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!bond) {
      return res.status(404).json({ error: 'Bond not found' });
    }

    const { name, mode, srt_latency, srt_overhead, srt_encryption, max_bandwidth } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (mode !== undefined) {
      const validModes = ['aggregate', 'broadcast', 'failover'];
      if (!validModes.includes(mode)) {
        return res.status(400).json({ error: 'Invalid mode' });
      }
      updates.push('mode = ?'); params.push(mode);
    }
    if (srt_latency !== undefined) { updates.push('srt_latency = ?'); params.push(srt_latency); }
    if (srt_overhead !== undefined) { updates.push('srt_overhead = ?'); params.push(srt_overhead); }
    if (srt_encryption !== undefined) { updates.push('srt_encryption = ?'); params.push(srt_encryption); }
    if (max_bandwidth !== undefined) { updates.push('max_bandwidth = ?'); params.push(max_bandwidth); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.prepare(`UPDATE srtla_bonds SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM srtla_bonds WHERE id = ?').get(req.params.id);
    console.log(`[SRTLA] Updated bond "${updated.name}" (${req.params.id})`);

    res.json({ message: 'Bond updated', bond: updated });
  } catch (err) {
    console.error('[SRTLA] Update bond error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to update bond.' });
  }
});

// ─── DELETE /bonds/:id ──────────────────────────────────────────────────────────
// Deletes a bond and its interfaces.
router.delete('/bonds/:id', (req, res) => {
  try {
    const db = getDb();

    const bond = db.prepare(`
      SELECT b.* FROM srtla_bonds b
      JOIN streams s ON b.stream_id = s.id
      WHERE b.id = ? AND s.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!bond) {
      return res.status(404).json({ error: 'Bond not found' });
    }

    // Stop monitoring if active
    srtlaManager.stopBondMonitoring(req.params.id);

    // Delete interfaces first, then the bond
    db.prepare('DELETE FROM srtla_interfaces WHERE bond_id = ?').run(req.params.id);
    db.prepare('DELETE FROM srtla_bonds WHERE id = ?').run(req.params.id);

    console.log(`[SRTLA] Deleted bond "${bond.name}" (${req.params.id})`);

    res.json({ message: 'Bond deleted' });
  } catch (err) {
    console.error('[SRTLA] Delete bond error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to delete bond.' });
  }
});

// ─── GET /bonds/:id/stats ───────────────────────────────────────────────────────
// Returns simulated real-time stats for each interface in the bond.
router.get('/bonds/:id/stats', (req, res) => {
  try {
    const db = getDb();

    const bond = db.prepare(`
      SELECT b.* FROM srtla_bonds b
      JOIN streams s ON b.stream_id = s.id
      WHERE b.id = ? AND s.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!bond) {
      return res.status(404).json({ error: 'Bond not found' });
    }

    // Fetch interfaces
    const interfaces = db.prepare(
      'SELECT * FROM srtla_interfaces WHERE bond_id = ? ORDER BY priority ASC'
    ).all(req.params.id);

    // Generate simulated stats for each interface
    const stats = srtlaManager.generateBondStats(bond, interfaces);

    res.json({ stats });
  } catch (err) {
    console.error('[SRTLA] Stats error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to get stats.' });
  }
});

// ─── POST /bonds/:id/interfaces ─────────────────────────────────────────────────
// Adds a network interface to a bond.
router.post('/bonds/:id/interfaces', (req, res) => {
  try {
    const db = getDb();

    const bond = db.prepare(`
      SELECT b.* FROM srtla_bonds b
      JOIN streams s ON b.stream_id = s.id
      WHERE b.id = ? AND s.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!bond) {
      return res.status(404).json({ error: 'Bond not found' });
    }

    const { name, type, ip_address, port, priority } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Interface name is required' });
    }

    const validTypes = ['cellular', 'wifi', 'ethernet', 'vpn'];
    const ifType = type || 'ethernet';
    if (!validTypes.includes(ifType)) {
      return res.status(400).json({
        error: 'Invalid interface type',
        message: `Type must be one of: ${validTypes.join(', ')}`
      });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO srtla_interfaces (id, bond_id, name, type, ip_address, port, priority, enabled, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'idle')
    `).run(id, req.params.id, name, ifType, ip_address || '', port || 0, priority || 1);

    const iface = db.prepare('SELECT * FROM srtla_interfaces WHERE id = ?').get(id);
    console.log(`[SRTLA] Added interface "${name}" (${ifType}) to bond ${req.params.id}`);

    res.status(201).json({ message: 'Interface added', interface: iface });
  } catch (err) {
    console.error('[SRTLA] Add interface error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to add interface.' });
  }
});

// ─── PUT /bonds/:id/interfaces/:ifId ────────────────────────────────────────────
// Updates an interface's settings.
router.put('/bonds/:id/interfaces/:ifId', (req, res) => {
  try {
    const db = getDb();

    const bond = db.prepare(`
      SELECT b.* FROM srtla_bonds b
      JOIN streams s ON b.stream_id = s.id
      WHERE b.id = ? AND s.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!bond) {
      return res.status(404).json({ error: 'Bond not found' });
    }

    const iface = db.prepare('SELECT * FROM srtla_interfaces WHERE id = ? AND bond_id = ?').get(req.params.ifId, req.params.id);
    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    const { name, type, ip_address, port, priority, enabled } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (type !== undefined) {
      const validTypes = ['cellular', 'wifi', 'ethernet', 'vpn'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: 'Invalid interface type' });
      }
      updates.push('type = ?'); params.push(type);
    }
    if (ip_address !== undefined) { updates.push('ip_address = ?'); params.push(ip_address); }
    if (port !== undefined) { updates.push('port = ?'); params.push(port); }
    if (priority !== undefined) { updates.push('priority = ?'); params.push(priority); }
    if (enabled !== undefined) { updates.push('enabled = ?'); params.push(enabled ? 1 : 0); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    params.push(req.params.ifId);
    db.prepare(`UPDATE srtla_interfaces SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM srtla_interfaces WHERE id = ?').get(req.params.ifId);

    res.json({ message: 'Interface updated', interface: updated });
  } catch (err) {
    console.error('[SRTLA] Update interface error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to update interface.' });
  }
});

// ─── DELETE /bonds/:id/interfaces/:ifId ─────────────────────────────────────────
// Removes an interface from a bond.
router.delete('/bonds/:id/interfaces/:ifId', (req, res) => {
  try {
    const db = getDb();

    const bond = db.prepare(`
      SELECT b.* FROM srtla_bonds b
      JOIN streams s ON b.stream_id = s.id
      WHERE b.id = ? AND s.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!bond) {
      return res.status(404).json({ error: 'Bond not found' });
    }

    const iface = db.prepare('SELECT * FROM srtla_interfaces WHERE id = ? AND bond_id = ?').get(req.params.ifId, req.params.id);
    if (!iface) {
      return res.status(404).json({ error: 'Interface not found' });
    }

    db.prepare('DELETE FROM srtla_interfaces WHERE id = ?').run(req.params.ifId);
    console.log(`[SRTLA] Removed interface "${iface.name}" from bond ${req.params.id}`);

    res.json({ message: 'Interface removed' });
  } catch (err) {
    console.error('[SRTLA] Remove interface error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to remove interface.' });
  }
});

// ─── GET /srt/config ────────────────────────────────────────────────────────────
// Returns available SRT latency presets for the frontend dropdown.
router.get('/srt/config', (req, res) => {
  const presets = [
    { label: 'Ultra Low (50ms)', value: 50 },
    { label: 'Low (60ms)', value: 60 },
    { label: 'Standard (90ms)', value: 90 },
    { label: 'Balanced (120ms)', value: 120 },
    { label: 'High Reliability (200ms)', value: 200 },
    { label: 'Maximum Buffer (500ms)', value: 500 },
    { label: 'Custom', value: 'custom' }
  ];

  res.json({
    presets,
    defaultLatency: 120,
    description: 'SRT latency determines the buffer size for error recovery. Lower values reduce delay but may cause artifacts on unstable connections.'
  });
});

module.exports = router;
