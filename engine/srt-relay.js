const { spawn } = require('child_process');
const path = require('path');
const { getDb } = require('../db/init');
const fs = require('fs');

const SRT_BASE_PORT = 9000;
const RTMP_HOST = '127.0.0.1';
const RTMP_PORT = 1935;
const relays = new Map();
let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

const usedPorts = new Set();

function getNextPort() {
  let port = SRT_BASE_PORT;
  while (usedPorts.has(port)) port++;
  return port;
}

function getPortForStream(streamKey) {
  const entry = relays.get(streamKey);
  return entry ? entry.port : null;
}

function startRelayForStream(streamKey, port) {
  if (relays.has(streamKey)) return;
  if (!port) port = getNextPort();

  const rtmpUrl = `rtmp://${RTMP_HOST}:${RTMP_PORT}/live/${streamKey}`;
  const srtUrl = `srt://0.0.0.0:${port}?mode=listener`;
  usedPorts.add(port);

  const proc = spawn('ffmpeg', [
    '-loglevel', 'warning',
    '-i', srtUrl,
    '-c', 'copy',
    '-f', 'flv',
    rtmpUrl
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  proc.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.log(`[SRT:${port}] ${msg}`);
  });

  proc.on('exit', (code, sig) => {
    console.log(`[SRT:${port}] exited code=${code} signal=${sig}`);
    relays.delete(streamKey);
    usedPorts.delete(port);
    if (code !== 0 && sig !== 'SIGTERM') {
      console.log(`[SRT:${port}] Auto-restarting in 2s...`);
      setTimeout(() => startRelayForStream(streamKey, port), 2000);
    }
  });

  relays.set(streamKey, { proc, port });
  console.log(`[SRT] Relay started: srt://0.0.0.0:${port} -> rtmp://${RTMP_HOST}:${RTMP_PORT}/live/${streamKey}`);
}

function stopRelayForStream(streamKey) {
  const entry = relays.get(streamKey);
  if (entry) {
    entry.proc.kill('SIGTERM');
    usedPorts.delete(entry.port);
    relays.delete(streamKey);
    console.log(`[SRT] Relay stopped for ${streamKey}`);
  }
}

function startAll() {
  try {
    const db = getDb();
    if (!db) return;
    const streams = db.prepare('SELECT id, stream_key FROM streams WHERE status != ?').all('archived');
    streams.forEach((s, i) => {
      startRelayForStream(s.stream_key, SRT_BASE_PORT + i);
    });
    if (streams.length === 0) {
      console.log('[SRT] No streams found to relay; SRT port 9000 not listening.');
    }
  } catch (e) {
    console.log('[SRT] No database yet; SRT relay deferred.');
  }
}

function stopAll() {
  for (const [key] of relays) {
    stopRelayForStream(key);
  }
}

function getRelays() {
  const result = {};
  for (const [key, entry] of relays) {
    result[key] = { port: entry.port, alive: !entry.proc.killed };
  }
  return result;
}

module.exports = { setIo, startRelayForStream, stopRelayForStream, startAll, stopAll, getRelays, getPortForStream, getNextPort };
