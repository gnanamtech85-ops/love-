/**
 * StreamCast - Live Video Streaming Platform Server
 * 
 * Main entry point for the Express application.
 * Sets up HTTP server, Socket.IO namespaces for real-time monitoring,
 * mounts all API routes, and initializes the SQLite database.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// Import database initializer
const { initDb } = require('./db/init');

// Import engine managers for Io wiring
const streamManager = require('./engine/stream-manager');
const srtlaManager = require('./engine/srtla-manager');

// Import route handlers
const authRoutes = require('./routes/auth');
const streamRoutes = require('./routes/streams');
const platformRoutes = require('./routes/platforms');
const srtlaRoutes = require('./routes/srtla');
const analyticsRoutes = require('./routes/analytics');
const recordingRoutes = require('./routes/recordings');
const billingRoutes = require('./routes/billing');

// ─── App & Server Setup ────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ─── Socket.IO Setup ───────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Expose io globally so route handlers can emit events
app.set('io', io);

// Wire IO into engine managers for real-time broadcasts
streamManager.setIo(io);
srtlaManager.setIo(io);

// ─── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/streams', streamRoutes);
app.use('/api/platforms', platformRoutes);
app.use('/api/srtla', srtlaRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/billing', billingRoutes);

// ─── Root redirect to dashboard ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.redirect('/dashboard.html');
});

// ─── Health Check Endpoint ──────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'StreamCast API',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ─── Socket.IO Namespace: /stream-monitor ───────────────────────────────────────
// Broadcasts simulated stream health data every 2 seconds to connected clients.
// Data includes bitrate, fps, viewer count, and uptime.
const streamMonitorNs = io.of('/stream-monitor');

streamMonitorNs.on('connection', (socket) => {
  console.log(`[Stream Monitor] Client connected: ${socket.id}`);

  // Track uptime in seconds for this connection's simulation
  let uptimeSeconds = 0;

  // Start broadcasting simulated health data every 2 seconds
  const healthInterval = setInterval(() => {
    uptimeSeconds += 2;

    const healthData = {
      streamId: 'sim-stream-001',
      bitrate: Math.floor(2500 + Math.random() * 3500),        // 2500-6000 kbps
      fps: Math.random() > 0.5 ? 60 : 30,                      // 30 or 60 fps
      viewers: Math.floor(50 + Math.random() * 500),            // 50-550 viewers
      uptime: uptimeSeconds,                                     // seconds
      resolution: '1920x1080',
      codec: 'H.264',
      keyframeInterval: 2,
      droppedFrames: Math.floor(Math.random() * 5),
      timestamp: new Date().toISOString()
    };

    socket.emit('stream:health', healthData);
  }, 2000);

  socket.on('disconnect', () => {
    console.log(`[Stream Monitor] Client disconnected: ${socket.id}`);
    clearInterval(healthInterval);
  });
});

// ─── Socket.IO Namespace: /srtla-monitor ────────────────────────────────────────
// Broadcasts simulated SRTLA bond stats every 1 second.
// Shows per-interface throughput, latency, and packet loss.
const srtlaMonitorNs = io.of('/srtla-monitor');

srtlaMonitorNs.on('connection', (socket) => {
  console.log(`[SRTLA Monitor] Client connected: ${socket.id}`);

  // Simulated interfaces for the bond
  const interfaces = [
    { name: 'Cellular 5G', type: 'cellular' },
    { name: 'WiFi 6', type: 'wifi' },
    { name: 'Ethernet', type: 'ethernet' }
  ];

  // Broadcast bond stats every second
  const bondInterval = setInterval(() => {
    const bondStats = {
      bondId: 'sim-bond-001',
      mode: 'aggregate',
      totalThroughput: 0,
      interfaces: interfaces.map((iface) => {
        const throughput = parseFloat((1 + Math.random() * 49).toFixed(2));  // 1-50 Mbps
        const latency = parseFloat((5 + Math.random() * 195).toFixed(1));    // 5-200 ms
        const packetLoss = parseFloat((Math.random() * 5).toFixed(2));       // 0-5%

        return {
          name: iface.name,
          type: iface.type,
          throughput,
          latency,
          packetLoss,
          packetsSent: Math.floor(10000 + Math.random() * 50000),
          packetsReceived: Math.floor(9800 + Math.random() * 49500),
          jitter: parseFloat((0.5 + Math.random() * 10).toFixed(2)),
          status: Math.random() > 0.05 ? 'active' : 'degraded'
        };
      }),
      timestamp: new Date().toISOString()
    };

    // Calculate total throughput
    bondStats.totalThroughput = parseFloat(
      bondStats.interfaces.reduce((sum, iface) => sum + iface.throughput, 0).toFixed(2)
    );

    socket.emit('srtla:bond-stats', bondStats);
  }, 1000);

  socket.on('disconnect', () => {
    console.log(`[SRTLA Monitor] Client disconnected: ${socket.id}`);
    clearInterval(bondInterval);
  });
});

// ─── Socket.IO Namespace: /live-preview ──────────────────────────────────────────
// Provides real-time stream health data to live preview overlays in the dashboard.
// Clients join with a streamId and receive periodic health updates.
const livePreviewNs = io.of('/live-preview');

livePreviewNs.on('connection', (socket) => {
  console.log(`[Live Preview] Client connected: ${socket.id}`);

  let previewInterval = null;
  let currentStreamId = null;

  socket.on('preview:join', ({ streamId }) => {
    currentStreamId = streamId;
    console.log(`[Live Preview] ${socket.id} joined preview for ${streamId}`);

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
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Live Preview] Client disconnected: ${socket.id}`);
    if (previewInterval) {
      clearInterval(previewInterval);
      previewInterval = null;
    }
  });
});

// ─── 404 Handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: [
      '/api/auth',
      '/api/streams',
      '/api/platforms',
      '/api/srtla',
      '/api/analytics',
      '/api/recordings',
      '/api/billing',
      '/api/health'
    ]
  });
});

// ─── Global Error Handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message
  });
});

// ─── Database Init & Server Start ───────────────────────────────────────────────
async function start() {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  StreamCast - Live Streaming Platform v1.0.0');
    console.log('═══════════════════════════════════════════════════════');
    console.log('[Init] Initializing database...');
    await initDb();
    console.log('[Init] Database initialized successfully.');

    server.listen(PORT, () => {
      console.log(`[Server] HTTP server listening on port ${PORT}`);
      console.log(`[Server] API available at http://localhost:${PORT}/api`);
      console.log(`[Socket.IO] Stream monitor: /stream-monitor`);
      console.log(`[Socket.IO] SRTLA monitor:  /srtla-monitor`);
      console.log(`[Socket.IO] Live preview:   /live-preview`);
      console.log('═══════════════════════════════════════════════════════');
      console.log('[Ready] StreamCast is ready to accept connections.');
      console.log('═══════════════════════════════════════════════════════');
    });
  } catch (err) {
    console.error('[Fatal] Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

module.exports = { app, server, io };
