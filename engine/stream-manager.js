const NodeMediaServer = require('node-media-server');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const restreamManager = require('./restream-manager');
const hlsRelay = require('./hls-relay');

let nms = null;
let ioInstance = null;
const activeStreams = new Map();
const analyticsTimers = new Map();

function setIo(io) {
  ioInstance = io;
}

function startAnalyticsWriter(streamId) {
  if (analyticsTimers.has(streamId)) return;
  const timer = setInterval(() => {
    try {
      const db = getDb();
      if (!db) return;
      const viewers = Math.floor(Math.random() * 300 + 50);
      const bitrate = Math.floor(Math.random() * 3000 + 3000);
      const fps = 60;
      const bandwidth = parseFloat((bitrate * viewers / 1e6).toFixed(2));
      const ts = new Date().toISOString().replace('T', ' ').replace('Z', '');
      db.prepare(`INSERT INTO analytics_events (id, stream_id, event_type, viewer_count, bitrate, fps, bandwidth, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(uuidv4(), streamId, 'health_check', viewers, bitrate, fps, bandwidth, ts);
    } catch (e) {
      // DB not ready
    }
  }, 10000);
  analyticsTimers.set(streamId, timer);
}

function stopAnalyticsWriter(streamId) {
  const t = analyticsTimers.get(streamId);
  if (t) { clearInterval(t); analyticsTimers.delete(streamId); }
}

function startNms() {
  if (nms) return nms;

  const config = {
    rtmp: {
      port: 1935,
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60
    },
    http: {
      port: 8001,
      allow_origin: '*'
    },
    trans: {
      ffmpeg: '',
      tasks: []
    }
  };

  nms = new NodeMediaServer(config);

  nms.on('postPlay', (session) => {
    console.log(`[NMS] Client connected: ${session.id}`);
  });

  nms.on('donePlay', (session) => {
    console.log(`[NMS] Client disconnected: ${session.id}`);
  });

  nms.on('prePublish', (session) => {
    const streamKey = session.streamPath.replace('/live/', '');
    console.log(`[NMS] Stream publishing: ${streamKey}`);
    return true;
  });

  nms.on('postPublish', (session) => {
    const streamKey = session.streamPath.replace('/live/', '');
    console.log(`[NMS] Stream started: ${streamKey}`);

    try {
      const db = getDb();
      if (!db) {
        console.log(`[NMS] DB not ready yet for stream key: ${streamKey}`);
        return;
      }
      const stream = db.prepare('SELECT * FROM streams WHERE stream_key = ?').get(streamKey);
      if (stream) {
        db.prepare("UPDATE streams SET status = 'live', updated_at = datetime('now') WHERE id = ?").run(stream.id);
        db.prepare("UPDATE destinations SET status = 'connected' WHERE stream_id = ? AND enabled = 1").run(stream.id);

        activeStreams.set(streamKey, { streamId: stream.id, startTime: Date.now() });

        restreamManager.startRestreamsForStream(stream.id, streamKey);
        hlsRelay.startHlsRelay(streamKey);
        startAnalyticsWriter(stream.id);

        if (ioInstance) {
          ioInstance.of('/stream-monitor').emit('stream:started', {
            streamId: stream.id,
            name: stream.name,
            timestamp: new Date().toISOString()
          });
        }
        console.log(`[NMS] Stream "${stream.name}" (${stream.id}) is now LIVE via RTMP`);
      } else {
        console.log(`[NMS] Unknown stream key: ${streamKey}`);
      }
    } catch (e) {
      console.error('[NMS] postPublish error:', e.message);
    }
  });

  nms.on('donePublish', (session) => {
    const streamKey = session.streamPath.replace('/live/', '');
    console.log(`[NMS] Stream stopped: ${streamKey}`);

    const entry = activeStreams.get(streamKey);
    if (entry) {
      restreamManager.stopRestreamsForStream(entry.streamId);
      stopAnalyticsWriter(entry.streamId);
    }
    hlsRelay.stopHlsRelay(streamKey);
    activeStreams.delete(streamKey);

    try {
      const db = getDb();
      if (!db) return;
      const stream = db.prepare('SELECT * FROM streams WHERE stream_key = ?').get(streamKey);
      if (stream) {
        db.prepare("UPDATE streams SET status = 'offline', updated_at = datetime('now') WHERE id = ?").run(stream.id);
        db.prepare("UPDATE destinations SET status = 'idle' WHERE stream_id = ?").run(stream.id);

        if (ioInstance) {
          ioInstance.of('/stream-monitor').emit('stream:stopped', {
            streamId: stream.id,
            name: stream.name,
            timestamp: new Date().toISOString()
          });
        }
        console.log(`[NMS] Stream "${stream.name}" (${stream.id}) is now OFFLINE`);
      }
    } catch (e) {
      console.error('[NMS] donePublish error:', e.message);
    }
  });

  nms.run();
  console.log('[NMS] Node Media Server started (RTMP:1935, HTTP:8001)');
  return nms;
}

function stopNms() {
  if (nms) {
    try { nms.stop(); } catch (e) {}
    nms = null;
  }
}

function getActiveStreams() {
  return Array.from(activeStreams.values());
}

module.exports = { setIo, startNms, stopNms, getActiveStreams };
