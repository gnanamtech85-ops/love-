const { spawn } = require('child_process');
const { getDb } = require('../db/init');

let ioInstance = null;
const streams = new Map();

function setIo(io) {
  ioInstance = io;
}

function getFullRtmpUrl(dest) {
  const base = dest.rtmp_url || '';
  const key = dest.stream_key || '';
  if (!base) return '';
  if (!key) return base;
  return base.replace(/\/$/, '') + '/' + key;
}

async function startRestreamsForStream(streamId, streamKey) {
  stopRestreamsForStream(streamId);
  try {
    const db = getDb();
    if (!db) return;
    const destinations = db.prepare(
      'SELECT * FROM destinations WHERE stream_id = ? AND enabled = 1'
    ).all(streamId);
    if (destinations.length === 0) return;

    const procs = [];
    for (const dest of destinations) {
      const fullUrl = getFullRtmpUrl(dest);
      if (!fullUrl) {
        console.log(`[Restream] Skipping ${dest.platform_name}: no RTMP URL`);
        continue;
      }
      const inputUrl = `rtmp://127.0.0.1:1935/live/${streamKey}`;
      const proc = spawn('ffmpeg', [
        '-loglevel', 'warning',
        '-i', inputUrl,
        '-c', 'copy',
        '-f', 'flv',
        fullUrl
      ], { stdio: ['ignore', 'pipe', 'pipe'] });
      proc.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) console.log(`[Restream:${dest.platform_name}] ${msg}`);
      });
      proc.on('exit', (code) => {
        console.log(`[Restream] ${dest.platform_name} exited code=${code}`);
      });
      procs.push({ id: dest.id, platform: dest.platform_name, proc });
      console.log(`[Restream] Started: ${dest.platform_name} -> ${fullUrl}`);
    }
    streams.set(streamId, { streamKey, procs });
  } catch (e) {
    console.error('[Restream] Error starting restreams:', e.message);
  }
}

function stopRestreamsForStream(streamId) {
  const entry = streams.get(streamId);
  if (!entry) return;
  for (const { id, platform, proc } of entry.procs) {
    try { proc.kill('SIGTERM'); } catch (e) {}
    console.log(`[Restream] Stopped: ${platform}`);
  }
  streams.delete(streamId);
}

function stopAll() {
  for (const [streamId] of streams) {
    stopRestreamsForStream(streamId);
  }
}

module.exports = { setIo, startRestreamsForStream, stopRestreamsForStream, stopAll };
