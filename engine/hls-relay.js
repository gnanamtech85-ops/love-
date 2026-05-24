const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HLS_ROOT = path.join(__dirname, '..', 'media', 'live');
const RELAY_HOST = process.env.RELAY_HOST || '127.0.0.1';
const RTMP_PORT = process.env.RTMP_PORT || 1935;

const relays = new Map();

function ensureDir(streamKey) {
  const dir = path.join(HLS_ROOT, streamKey);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function startHlsRelay(streamKey) {
  if (relays.has(streamKey)) return;

  const outDir = ensureDir(streamKey);
  const rtmpUrl = `rtmp://${RELAY_HOST}:${RTMP_PORT}/live/${streamKey}`;
  const hlsPath = path.join(outDir, 'index.m3u8');

  const proc = spawn('ffmpeg', [
    '-loglevel', 'warning',
    '-i', rtmpUrl,
    '-c', 'copy',
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '6',
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', path.join(outDir, 'segment_%03d.ts'),
    hlsPath
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  proc.stdout.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.log(`[HLS:${streamKey}] ${msg}`);
  });

  proc.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.log(`[HLS:${streamKey}] ${msg}`);
  });

  proc.on('exit', (code, sig) => {
    console.log(`[HLS:${streamKey}] exited code=${code} signal=${sig}`);
    relays.delete(streamKey);
  });

  relays.set(streamKey, proc);
  console.log(`[HLS] Relay started: ${rtmpUrl} -> ${hlsPath}`);
}

function stopHlsRelay(streamKey) {
  const entry = relays.get(streamKey);
  if (entry) {
    entry.kill('SIGTERM');
    relays.delete(streamKey);
    console.log(`[HLS] Relay stopped: ${streamKey}`);
  }
}

function stopAll() {
  for (const [key, proc] of relays) {
    proc.kill('SIGTERM');
  }
  relays.clear();
}

module.exports = { startHlsRelay, stopHlsRelay, stopAll };
