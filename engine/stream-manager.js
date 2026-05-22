const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');

const simulations = new Map();
let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function startSimulation(streamId) {
  if (simulations.has(streamId)) return;
  const db = getDb();
  let uptime = 0;
  const interval = setInterval(() => {
    uptime += 5;
    const viewers = Math.floor(20 + Math.random() * 480);
    const bitrate = Math.floor(2000 + Math.random() * 4000);
    const fps = Math.random() > 0.3 ? 60 : 30;
    const bandwidth = parseFloat((bitrate * viewers / 1e6).toFixed(2));
    db.prepare(`
      INSERT INTO analytics_events (id, stream_id, event_type, viewer_count, bitrate, fps, bandwidth, timestamp)
      VALUES (?, ?, 'health_check', ?, ?, ?, ?, datetime('now'))
    `).run(uuidv4(), streamId, viewers, bitrate, fps, bandwidth);
    if (ioInstance) {
      ioInstance.of('/stream-monitor').emit('stream:health', {
        streamId,
        bitrate,
        fps,
        viewers,
        uptime,
        resolution: '1920x1080',
        codec: 'H.264',
        keyframeInterval: 2,
        droppedFrames: Math.floor(Math.random() * 5),
        bandwidth,
        timestamp: new Date().toISOString()
      });
    }
  }, 5000);
  simulations.set(streamId, interval);
}

function stopSimulation(streamId) {
  if (simulations.has(streamId)) {
    clearInterval(simulations.get(streamId));
    simulations.delete(streamId);
  }
}

module.exports = { setIo, startSimulation, stopSimulation };
