const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { getDb, initDb, isDbReady } = require('./db/init');
const streamManager = require('./engine/stream-manager');
const srtlaManager = require('./engine/srtla-manager');
const srtRelay = require('./engine/srt-relay');
const restreamManager = require('./engine/restream-manager');

const authRoutes = require('./routes/auth');
const streamRoutes = require('./routes/streams');
const platformRoutes = require('./routes/platforms');
const srtlaRoutes = require('./routes/srtla');
const analyticsRoutes = require('./routes/analytics');
const recordingRoutes = require('./routes/recordings');
const billingRoutes = require('./routes/billing');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.set('io', io);
streamManager.setIo(io);
srtlaManager.setIo(io);
restreamManager.setIo(io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/live', express.static(path.join(__dirname, 'media', 'live')));

// Middleware that rejects API requests with 503 while the database is still
// initializing. /api/health is intentionally excluded so load balancers and
// health checks always get a fast response.
function requireDbReady(req, res, next) {
  if (isDbReady()) return next();
  res.status(503).json({
    error: 'Service Unavailable',
    message: 'Database is initializing, please retry in a moment.',
    retryAfter: 5
  });
}

app.use('/api/auth', requireDbReady, authRoutes);
app.use('/api/streams', requireDbReady, streamRoutes);
app.use('/api/platforms', requireDbReady, platformRoutes);
app.use('/api/srtla', requireDbReady, srtlaRoutes);
app.use('/api/analytics', requireDbReady, analyticsRoutes);
app.use('/api/recordings', requireDbReady, recordingRoutes);
app.use('/api/billing', requireDbReady, billingRoutes);

app.get('/', (req, res) => {
  res.redirect('/dashboard.html');
});

app.get('/api/health', (req, res) => {
  const dbReady = isDbReady();
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? 'ok' : 'initializing',
    service: 'StreamCast API',
    version: '1.0.0',
    dbReady,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/srt-relay', (req, res) => {
  res.json({ relays: srtRelay.getRelays() });
});

app.post('/api/srt-relay/restart', requireDbReady, (req, res) => {
  srtRelay.stopAll();
  srtRelay.startAll();
  res.json({ status: 'ok', relays: srtRelay.getRelays() });
});

const streamMonitorNs = io.of('/stream-monitor');
streamMonitorNs.on('connection', (socket) => {
  console.log(`[Stream Monitor] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[Stream Monitor] Client disconnected: ${socket.id}`);
  });
});

const srtlaMonitorNs = io.of('/srtla-monitor');
srtlaMonitorNs.on('connection', (socket) => {
  console.log(`[SRTLA Monitor] Client connected: ${socket.id}`);
  let bondInterval = null;
  socket.on('srtla:join', ({ bondId }) => {
    if (bondInterval) clearInterval(bondInterval);
    bondInterval = setInterval(() => {
      try {
        const db = getDb();
        if (!db) return;
        const bond = db.prepare(`
          SELECT b.* FROM srtla_bonds b WHERE b.id = ?
        `).get(bondId);
        if (!bond) return;
        const interfaces = db.prepare(
          'SELECT * FROM srtla_interfaces WHERE bond_id = ? ORDER BY priority ASC'
        ).all(bondId);
        const totalThroughput = interfaces.reduce((sum, iface) => sum + (iface.throughput || 0), 0);
        socket.emit('srtla:bond-stats', {
          bondId,
          mode: bond.mode,
          totalThroughput: parseFloat(totalThroughput.toFixed(2)),
          srtLatency: bond.srt_latency || 120,
          interfaces: interfaces.map(iface => ({
            name: iface.name,
            type: iface.type,
            throughput: iface.throughput || 0,
            latency: iface.latency || 0,
            packetLoss: iface.packet_loss || 0,
            packetsSent: iface.packets_sent || 0,
            packetsReceived: iface.packets_received || 0,
            jitter: iface.jitter || 0,
            priority: iface.priority,
            status: iface.status || 'idle',
            enabled: !!iface.enabled
          })),
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        // bond not found or DB not ready
      }
    }, 2000);
  });
  socket.on('disconnect', () => {
    if (bondInterval) clearInterval(bondInterval);
  });
});

const livePreviewNs = io.of('/live-preview');
livePreviewNs.on('connection', (socket) => {
  console.log(`[Live Preview] Client connected: ${socket.id}`);
  let previewInterval = null;
  let currentStreamId = null;
  socket.on('preview:join', ({ streamId }) => {
    currentStreamId = streamId;
    if (previewInterval) clearInterval(previewInterval);
    previewInterval = setInterval(() => {
      if (!currentStreamId) return;
      try {
        const db = getDb();
        if (!db) return;
        const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(currentStreamId);
        if (!stream) return;
        const latest = db.prepare(`
          SELECT viewer_count, bitrate, fps, bandwidth, timestamp
          FROM analytics_events WHERE stream_id = ? ORDER BY timestamp DESC LIMIT 1
        `).get(currentStreamId);
        const isLive = stream.status === 'live';
        socket.emit('preview:health', {
          streamId: currentStreamId,
          bitrate: latest ? latest.bitrate : 0,
          fps: latest ? latest.fps : 0,
          viewers: latest ? latest.viewer_count : 0,
          srtLatency: stream.srt_latency || 120,
          resolution: '1920x1080',
          codec: 'H.264',
          droppedFrames: 0,
          status: isLive ? 'live' : 'offline',
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        // stream not found or DB not ready
      }
    }, 2000);
  });
  socket.on('preview:leave', () => {
    currentStreamId = null;
    if (previewInterval) { clearInterval(previewInterval); previewInterval = null; }
  });
  socket.on('disconnect', () => {
    if (previewInterval) { clearInterval(previewInterval); previewInterval = null; }
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: [
      '/api/auth', '/api/streams', '/api/platforms', '/api/srtla',
      '/api/analytics', '/api/recordings', '/api/billing', '/api/health'
    ]
  });
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

async function start() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  StreamCast - Live Streaming Platform v1.0.0');
  console.log('═══════════════════════════════════════════════════════');

  streamManager.startNms();
  srtRelay.setIo(io);

  // Start listening immediately so the process is reachable for health checks
  // and load-balancer probes before the database finishes initializing.
  await new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`[Server] HTTP server listening on port ${PORT}`);
      console.log(`[Server] API available at http://localhost:${PORT}/api`);
      console.log(`[Server] RTMP ingest at rtmp://localhost:1935/live/STREAM_KEY`);
      console.log(`[Server] HLS playback at http://localhost:${PORT}/live/STREAM_NAME/index.m3u8`);
      console.log(`[Socket.IO] Stream monitor: /stream-monitor`);
      console.log(`[Socket.IO] SRTLA monitor:  /srtla-monitor`);
      console.log(`[Socket.IO] Live preview:   /live-preview`);
      console.log('═══════════════════════════════════════════════════════');
      console.log('[Server] Accepting connections. Database initializing in background...');
      console.log('═══════════════════════════════════════════════════════');
      resolve();
    });
  });

  // Initialize the database asynchronously after the server is already
  // listening. API routes are gated by requireDbReady() and return 503 until
  // this completes. /api/health always responds immediately.
  console.log('[Init] Initializing database...');
  try {
    await initDb();
    console.log('[Init] Database initialized successfully. All API routes are now active.');
    srtRelay.startAll();
  } catch (err) {
    console.error('[Fatal] Database initialization failed:', err.message);
    process.exit(1);
  }
}

start();

module.exports = { app, server, io };
