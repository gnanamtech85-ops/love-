const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const { initDb, isDbReady } = require('./db/init');
const streamManager = require('./engine/stream-manager');
const srtlaManager = require('./engine/srtla-manager');
const srtRelay = require('./engine/srt-relay');

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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

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
  const interfaces = [
    { name: 'Cellular 5G', type: 'cellular' },
    { name: 'WiFi 6', type: 'wifi' },
    { name: 'Ethernet', type: 'ethernet' }
  ];
  const bondInterval = setInterval(() => {
    const bondStats = {
      bondId: 'sim-bond-001',
      mode: 'aggregate',
      totalThroughput: 0,
      interfaces: interfaces.map((iface) => {
        const throughput = parseFloat((1 + Math.random() * 49).toFixed(2));
        const latency = parseFloat((5 + Math.random() * 195).toFixed(1));
        const packetLoss = parseFloat((Math.random() * 5).toFixed(2));
        return {
          name: iface.name,
          type: iface.type,
          throughput, latency, packetLoss,
          packetsSent: Math.floor(10000 + Math.random() * 50000),
          packetsReceived: Math.floor(9800 + Math.random() * 49500),
          jitter: parseFloat((0.5 + Math.random() * 10).toFixed(2)),
          status: Math.random() > 0.05 ? 'active' : 'degraded'
        };
      }),
      timestamp: new Date().toISOString()
    };
    bondStats.totalThroughput = parseFloat(
      bondStats.interfaces.reduce((sum, iface) => sum + iface.throughput, 0).toFixed(2)
    );
    socket.emit('srtla:bond-stats', bondStats);
  }, 1000);
  socket.on('disconnect', () => {
    clearInterval(bondInterval);
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
      if (currentStreamId) {
        socket.emit('preview:health', {
          streamId: currentStreamId,
          bitrate: Math.floor(2500 + Math.random() * 3500),
          fps: Math.random() > 0.3 ? 60 : 30,
          viewers: Math.floor(10 + Math.random() * 300),
          srtLatency: Math.random() > 0.5 ? 90 : 120,
          resolution: '1920x1080',
          codec: 'H.264',
          droppedFrames: Math.floor(Math.random() * 3),
          timestamp: new Date().toISOString()
        });
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

app.use('/live', createProxyMiddleware({
  target: 'http://localhost:8001',
  changeOrigin: true,
  onError: (err, req, res) => {
    res.status(502).json({ error: 'HLS stream unavailable' });
  }
}));

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
