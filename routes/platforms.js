/**
 * StreamCast - Platform & Destination Routes
 * 
 * Manages supported streaming platforms and per-stream destination configurations.
 * Each stream can restream to multiple platforms simultaneously.
 * 
 * Routes:
 *   GET    /                                        - List supported platforms
 *   POST   /streams/:streamId/destinations          - Add destination to a stream
 *   DELETE /streams/:streamId/destinations/:destId   - Remove destination
 *   PUT    /streams/:streamId/destinations/:destId/toggle   - Toggle enabled/disabled
 *   PUT    /streams/:streamId/destinations/:destId/metadata - Update title/description
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// All platform routes require authentication
router.use(authMiddleware);

// ─── Supported Platforms Definition ─────────────────────────────────────────────
// Static list of platforms with branding info for the frontend
const SUPPORTED_PLATFORMS = [
  {
    id: 'youtube',
    name: 'YouTube',
    icon: 'youtube',
    color: '#FF0000',
    type: 'rtmp',
    defaultRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    description: 'Stream to YouTube Live'
  },
  {
    id: 'twitch',
    name: 'Twitch',
    icon: 'twitch',
    color: '#9146FF',
    type: 'rtmp',
    defaultRtmpUrl: 'rtmp://live.twitch.tv/app',
    description: 'Stream to Twitch'
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    color: '#1877F2',
    type: 'rtmp',
    defaultRtmpUrl: 'rtmps://live-api-s.facebook.com:443/rtmp',
    description: 'Stream to Facebook Live'
  },
  {
    id: 'kick',
    name: 'Kick',
    icon: 'kick',
    color: '#53FC18',
    type: 'rtmp',
    defaultRtmpUrl: 'rtmp://fa723fc1b171.global-contribute.live-video.net/app',
    description: 'Stream to Kick'
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'instagram',
    color: 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)',
    type: 'rtmp',
    defaultRtmpUrl: 'rtmps://live-upload.instagram.com:443/rtmp',
    description: 'Stream to Instagram Live'
  },
  {
    id: 'twitter',
    name: 'X / Twitter',
    icon: 'twitter-x',
    color: '#000000',
    type: 'rtmp',
    defaultRtmpUrl: 'rtmp://va.pscp.tv:80/x',
    description: 'Stream to X (Twitter)'
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'linkedin',
    color: '#0A66C2',
    type: 'rtmp',
    defaultRtmpUrl: 'rtmp://rtmp.linkedin.com/live',
    description: 'Stream to LinkedIn Live'
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: 'tiktok',
    color: '#010101',
    type: 'rtmp',
    defaultRtmpUrl: 'rtmp://push.tiktok.com/live',
    description: 'Stream to TikTok Live'
  },
  {
    id: 'custom_rtmp',
    name: 'Custom RTMP',
    icon: 'broadcast',
    color: '#6B7280',
    type: 'rtmp',
    defaultRtmpUrl: '',
    description: 'Stream to any RTMP server'
  },
  {
    id: 'custom_srt',
    name: 'Custom SRT',
    icon: 'shield-check',
    color: '#14B8A6',
    type: 'srt',
    defaultRtmpUrl: '',
    description: 'Stream via SRT protocol'
  }
];

// ─── GET / ──────────────────────────────────────────────────────────────────────
// Returns the list of supported platforms with their branding/configuration.
router.get('/', (req, res) => {
  res.json({ platforms: SUPPORTED_PLATFORMS });
});

// ─── POST /streams/:streamId/destinations ───────────────────────────────────────
// Adds a new destination (platform) to a stream.
router.post('/streams/:streamId/destinations', (req, res) => {
  try {
    const { streamId } = req.params;
    const { platform, rtmp_url, stream_key, srt_url, srt_port, metadata_title, metadata_description } = req.body;

    const db = getDb();

    // Verify stream belongs to user
    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(streamId, req.user.id);
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    // Validate platform
    if (!platform) {
      return res.status(400).json({ error: 'Platform is required' });
    }

    const platformInfo = SUPPORTED_PLATFORMS.find(p => p.id === platform);
    if (!platformInfo) {
      return res.status(400).json({
        error: 'Unsupported platform',
        message: `"${platform}" is not a supported platform.`,
        supported: SUPPORTED_PLATFORMS.map(p => p.id)
      });
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO destinations (id, stream_id, platform, platform_name, rtmp_url, stream_key, srt_url, srt_port, enabled, status, metadata_title, metadata_description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'idle', ?, ?)
    `).run(
      id, streamId, platform, platformInfo.name,
      rtmp_url || platformInfo.defaultRtmpUrl || '',
      stream_key || '',
      srt_url || '',
      srt_port || 0,
      metadata_title || '',
      metadata_description || ''
    );

    const destination = db.prepare('SELECT * FROM destinations WHERE id = ?').get(id);
    console.log(`[Platforms] Added ${platformInfo.name} destination to stream ${streamId}`);

    res.status(201).json({
      message: 'Destination added',
      destination
    });
  } catch (err) {
    console.error('[Platforms] Add destination error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to add destination.' });
  }
});

// ─── DELETE /streams/:streamId/destinations/:destId ─────────────────────────────
// Removes a destination from a stream.
router.delete('/streams/:streamId/destinations/:destId', (req, res) => {
  try {
    const { streamId, destId } = req.params;
    const db = getDb();

    // Verify stream ownership
    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(streamId, req.user.id);
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const dest = db.prepare('SELECT * FROM destinations WHERE id = ? AND stream_id = ?').get(destId, streamId);
    if (!dest) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    db.prepare('DELETE FROM destinations WHERE id = ?').run(destId);
    console.log(`[Platforms] Removed ${dest.platform_name} destination from stream ${streamId}`);

    res.json({ message: 'Destination removed' });
  } catch (err) {
    console.error('[Platforms] Delete destination error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to remove destination.' });
  }
});

// ─── PUT /streams/:streamId/destinations/:destId/toggle ─────────────────────────
// Toggles a destination between enabled and disabled.
router.put('/streams/:streamId/destinations/:destId/toggle', (req, res) => {
  try {
    const { streamId, destId } = req.params;
    const db = getDb();

    // Verify stream ownership
    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(streamId, req.user.id);
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const dest = db.prepare('SELECT * FROM destinations WHERE id = ? AND stream_id = ?').get(destId, streamId);
    if (!dest) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    // Toggle the enabled flag
    const newEnabled = dest.enabled ? 0 : 1;
    db.prepare('UPDATE destinations SET enabled = ? WHERE id = ?').run(newEnabled, destId);

    console.log(`[Platforms] ${dest.platform_name} destination ${newEnabled ? 'enabled' : 'disabled'} on stream ${streamId}`);

    res.json({
      message: `Destination ${newEnabled ? 'enabled' : 'disabled'}`,
      destination: { ...dest, enabled: newEnabled }
    });
  } catch (err) {
    console.error('[Platforms] Toggle error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to toggle destination.' });
  }
});

// ─── PUT /streams/:streamId/destinations/:destId/metadata ───────────────────────
// Updates the title and description metadata for a destination.
router.put('/streams/:streamId/destinations/:destId/metadata', (req, res) => {
  try {
    const { streamId, destId } = req.params;
    const { metadata_title, metadata_description } = req.body;
    const db = getDb();

    // Verify stream ownership
    const stream = db.prepare('SELECT * FROM streams WHERE id = ? AND user_id = ?').get(streamId, req.user.id);
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const dest = db.prepare('SELECT * FROM destinations WHERE id = ? AND stream_id = ?').get(destId, streamId);
    if (!dest) {
      return res.status(404).json({ error: 'Destination not found' });
    }

    const updates = [];
    const params = [];

    if (metadata_title !== undefined) {
      updates.push('metadata_title = ?');
      params.push(metadata_title);
    }
    if (metadata_description !== undefined) {
      updates.push('metadata_description = ?');
      params.push(metadata_description);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No metadata fields provided' });
    }

    params.push(destId);
    db.prepare(`UPDATE destinations SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db.prepare('SELECT * FROM destinations WHERE id = ?').get(destId);
    console.log(`[Platforms] Updated metadata for ${dest.platform_name} on stream ${streamId}`);

    res.json({
      message: 'Metadata updated',
      destination: updated
    });
  } catch (err) {
    console.error('[Platforms] Metadata update error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to update metadata.' });
  }
});

module.exports = router;
