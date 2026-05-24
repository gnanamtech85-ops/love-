const NodeMediaServer = require('node-media-server');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');

let nms = null;
let ioInstance = null;
const activeStreams = new Map();

const HLS_DIR = path.join(__dirname, '..', 'media', 'live');

function setIo(io) {
  ioInstance = io;
}

function startNms() {
  if (nms) return nms;

  if (!fs.existsSync(HLS_DIR)) {
    fs.mkdirSync(HLS_DIR, { recursive: true });
  }

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
      mediaroot: path.join(__dirname, '..', 'media'),
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

    const db = getDb();
    const stream = db.prepare('SELECT * FROM streams WHERE stream_key = ?').get(streamKey);
    if (stream) {
      db.prepare("UPDATE streams SET status = 'live', updated_at = datetime('now') WHERE id = ?").run(stream.id);
      db.prepare("UPDATE destinations SET status = 'connected' WHERE stream_id = ? AND enabled = 1").run(stream.id);

      activeStreams.set(streamKey, { streamId: stream.id, startTime: Date.now() });

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
  });

  nms.on('donePublish', (session) => {
    const streamKey = session.streamPath.replace('/live/', '');
    console.log(`[NMS] Stream stopped: ${streamKey}`);

    activeStreams.delete(streamKey);

    const db = getDb();
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
