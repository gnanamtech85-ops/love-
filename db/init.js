const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const wrapper = require('./sqlite-wrapper');

let initialized = false;

// Returns null if DB not ready — callers must guard with if (!db) return
function getDb() {
  if (!initialized) return null;
  return {
    prepare: wrapper.prepare,
    exec: wrapper.exec
  };
}

// Yield to the event loop between operations so the server stays responsive.
function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function initDb() {
  if (initialized) return;
  await wrapper.initSqlite();
  const database = wrapper;

  // Create each table in its own async turn so the event loop is never blocked
  // for more than a single DDL statement at a time.
  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '', avatar_url TEXT DEFAULT '', plan TEXT DEFAULT 'starter',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
  await database.exec(`
    CREATE TABLE IF NOT EXISTS streams (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
      description TEXT DEFAULT '', stream_key TEXT UNIQUE NOT NULL,
      rtmp_url TEXT NOT NULL, srt_url TEXT NOT NULL, srt_latency INTEGER DEFAULT 120,
      status TEXT DEFAULT 'offline' CHECK(status IN ('offline','live','error')),
      region TEXT DEFAULT 'us-east', recording_enabled INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  await database.exec(`
    CREATE TABLE IF NOT EXISTS destinations (
      id TEXT PRIMARY KEY, stream_id TEXT NOT NULL, platform TEXT NOT NULL,
      platform_name TEXT NOT NULL, rtmp_url TEXT DEFAULT '', stream_key TEXT DEFAULT '',
      srt_url TEXT DEFAULT '', srt_port INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1, status TEXT DEFAULT 'idle',
      metadata_title TEXT DEFAULT '', metadata_description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
    );
  `);
  await database.exec(`
    CREATE TABLE IF NOT EXISTS srtla_bonds (
      id TEXT PRIMARY KEY, stream_id TEXT NOT NULL, name TEXT NOT NULL,
      mode TEXT DEFAULT 'aggregate' CHECK(mode IN ('aggregate','broadcast','failover')),
      srt_latency INTEGER DEFAULT 120, srt_overhead INTEGER DEFAULT 25,
      srt_encryption TEXT DEFAULT 'none', max_bandwidth INTEGER DEFAULT 0,
      status TEXT DEFAULT 'idle',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
    );
  `);
  await database.exec(`
    CREATE TABLE IF NOT EXISTS srtla_interfaces (
      id TEXT PRIMARY KEY, bond_id TEXT NOT NULL, name TEXT NOT NULL,
      type TEXT CHECK(type IN ('cellular','wifi','ethernet','vpn')),
      ip_address TEXT DEFAULT '', port INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 1, enabled INTEGER DEFAULT 1,
      status TEXT DEFAULT 'idle',
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (bond_id) REFERENCES srtla_bonds(id) ON DELETE CASCADE
    );
  `);
  // Create recordings table first (with file_path column), then apply migration
  // for any existing DB that may be missing the column.
  await database.exec(`
    CREATE TABLE IF NOT EXISTS recordings (
      id TEXT PRIMARY KEY, stream_id TEXT NOT NULL, filename TEXT NOT NULL,
      duration INTEGER DEFAULT 0, size INTEGER DEFAULT 0, format TEXT DEFAULT 'mp4',
      status TEXT DEFAULT 'available', file_path TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
    );
  `);
  await database.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY, stream_id TEXT NOT NULL, event_type TEXT NOT NULL,
      viewer_count INTEGER DEFAULT 0, bitrate INTEGER DEFAULT 0, fps INTEGER DEFAULT 0,
      bandwidth REAL DEFAULT 0, timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE CASCADE
    );
  `);
  await database.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT DEFAULT 'starter',
      status TEXT DEFAULT 'active', bandwidth_used REAL DEFAULT 0,
      bandwidth_limit REAL DEFAULT 50, stream_hours_used REAL DEFAULT 0,
      stream_hours_limit REAL DEFAULT 20, storage_used REAL DEFAULT 0,
      storage_limit REAL DEFAULT 10, created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT DEFAULT (datetime('now', '+30 days')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Schema migrations for existing databases
  try { await database.exec(`ALTER TABLE streams ADD COLUMN protocol TEXT DEFAULT 'rtmp'`); } catch (e) {}
  try { await database.exec(`ALTER TABLE streams ADD COLUMN srt_overhead INTEGER DEFAULT 25`); } catch (e) {}
  try { await database.exec(`ALTER TABLE streams ADD COLUMN srt_encryption TEXT DEFAULT 'none'`); } catch (e) {}
  try { await database.exec(`ALTER TABLE streams ADD COLUMN max_bandwidth INTEGER DEFAULT 0`); } catch (e) {}
  try { await database.exec(`ALTER TABLE srtla_interfaces ADD COLUMN throughput REAL DEFAULT 0`); } catch (e) {}
  try { await database.exec(`ALTER TABLE srtla_interfaces ADD COLUMN latency REAL DEFAULT 0`); } catch (e) {}
  try { await database.exec(`ALTER TABLE srtla_interfaces ADD COLUMN packet_loss REAL DEFAULT 0`); } catch (e) {}
  try { await database.exec(`ALTER TABLE srtla_interfaces ADD COLUMN packets_sent INTEGER DEFAULT 0`); } catch (e) {}
  try { await database.exec(`ALTER TABLE srtla_interfaces ADD COLUMN packets_received INTEGER DEFAULT 0`); } catch (e) {}
  try { await database.exec(`ALTER TABLE srtla_interfaces ADD COLUMN jitter REAL DEFAULT 0`); } catch (e) {}
  try { await database.exec(`ALTER TABLE recordings ADD COLUMN file_path TEXT DEFAULT ''`); } catch (e) {}

  await yieldToEventLoop();

  const existing = database.prepare('SELECT id FROM users WHERE email = ?').get('demo@streamcast.io');
  if (existing) {
    console.log('[DB] Sample data exists, skipping seed.');
    initialized = true;
    return;
  }

  console.log('[DB] Seeding sample data...');
  const userId = uuidv4();
  const passwordHash = bcrypt.hashSync('demo123', 10);

  await yieldToEventLoop();
  database.prepare(`INSERT INTO users (id, email, password_hash, name, avatar_url, plan) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(userId, 'demo@streamcast.io', passwordHash, 'Demo User', 'https://ui-avatars.com/api/?name=Demo+User&size=128', 'pro');

  const streamKeys = [uuidv4(), uuidv4(), uuidv4()];
  const streamIds = [uuidv4(), uuidv4(), uuidv4()];
  const streams = [
    { id: streamIds[0], name: 'Gaming Live Stream', desc: 'Daily gaming sessions', key: streamKeys[0], status: 'offline', region: 'us-east', rec: 1 },
    { id: streamIds[1], name: 'Tech Talk Show', desc: 'Weekly tech discussions', key: streamKeys[1], status: 'offline', region: 'eu-west', rec: 1 },
    { id: streamIds[2], name: 'IRL Adventure Stream', desc: 'Outdoor adventures via SRTLA', key: streamKeys[2], status: 'offline', region: 'ap-southeast', rec: 0 }
  ];

  await yieldToEventLoop();
  for (const s of streams) {
    database.prepare(`INSERT INTO streams (id, user_id, name, description, stream_key, rtmp_url, srt_url, srt_latency, status, region, recording_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(s.id, userId, s.name, s.desc, s.key, `rtmp://ingest.streamcast.io/live/${s.key}`, `srt://ingest.streamcast.io:9000?streamid=${s.key}`, 120, s.status, s.region, s.rec);
  }

  await yieldToEventLoop();
  const insDest = database.prepare(`INSERT INTO destinations (id, stream_id, platform, platform_name, rtmp_url, stream_key, enabled, status, metadata_title, metadata_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insDest.run(uuidv4(), streamIds[0], 'youtube', 'YouTube', 'rtmp://a.rtmp.youtube.com/live2', 'xxxx-xxxx', 1, 'idle', 'Gaming Live!', '');
  insDest.run(uuidv4(), streamIds[0], 'twitch', 'Twitch', 'rtmp://live.twitch.tv/app', 'live_xxxxx', 1, 'idle', 'Gaming Live!', '');
  insDest.run(uuidv4(), streamIds[0], 'kick', 'Kick', 'rtmp://kick.example.com/app', 'sk_xxxxx', 1, 'idle', 'Gaming Live!', '');
  insDest.run(uuidv4(), streamIds[1], 'youtube', 'YouTube', 'rtmp://a.rtmp.youtube.com/live2', 'yyyy-yyyy', 1, 'idle', 'Tech Talk', '');
  insDest.run(uuidv4(), streamIds[1], 'linkedin', 'LinkedIn', 'rtmp://rtmp.linkedin.com/live', 'ln_xxxxx', 1, 'idle', 'Tech Talk', '');
  insDest.run(uuidv4(), streamIds[2], 'twitch', 'Twitch', 'rtmp://live.twitch.tv/app', 'live_yyyy', 1, 'idle', 'IRL Adventure', '');
  insDest.run(uuidv4(), streamIds[2], 'facebook', 'Facebook', 'rtmps://live-api-s.facebook.com:443/rtmp', 'FB-xxxxx', 0, 'idle', 'IRL Adventure', '');

  await yieldToEventLoop();
  const bondId = uuidv4();
  database.prepare(`INSERT INTO srtla_bonds (id, stream_id, name, mode, srt_latency, srt_overhead, srt_encryption, max_bandwidth, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(bondId, streamIds[2], 'IRL Mobile Bond', 'aggregate', 120, 25, 'none', 50000, 'idle');
  const insIface = database.prepare(`INSERT INTO srtla_interfaces (id, bond_id, name, type, ip_address, port, priority, enabled, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insIface.run(uuidv4(), bondId, '5G T-Mobile', 'cellular', '10.0.1.100', 9000, 1, 1, 'idle');
  insIface.run(uuidv4(), bondId, 'WiFi Hotspot', 'wifi', '192.168.1.50', 9001, 2, 1, 'idle');
  insIface.run(uuidv4(), bondId, 'USB Ethernet', 'ethernet', '172.16.0.10', 9002, 3, 1, 'idle');

  await yieldToEventLoop();
  const insAnalytics = database.prepare(`INSERT INTO analytics_events (id, stream_id, event_type, viewer_count, bitrate, fps, bandwidth, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const now = new Date();
  for (let i = 24; i >= 0; i--) {
    const ts = new Date(now.getTime() - i * 3600 * 1000).toISOString().replace('T', ' ').replace('Z', '');
    const viewers = Math.floor(50 + Math.random() * 450);
    const bitrate = Math.floor(3000 + Math.random() * 3000);
    insAnalytics.run(uuidv4(), streamIds[0], 'health_check', viewers, bitrate, 60, parseFloat((bitrate * viewers / 1e6).toFixed(2)), ts);
    if (i % 8 === 0) await yieldToEventLoop();
  }

  await yieldToEventLoop();
  const insRec = database.prepare(`INSERT INTO recordings (id, stream_id, filename, duration, size, format, status) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insRec.run(uuidv4(), streamIds[0], 'gaming-session-2024-01-15.mp4', 7200, 5368709120, 'mp4', 'available');
  insRec.run(uuidv4(), streamIds[0], 'gaming-session-2024-01-14.mp4', 5400, 4026531840, 'mp4', 'available');
  insRec.run(uuidv4(), streamIds[1], 'tech-talk-ep42.mp4', 3600, 2684354560, 'mp4', 'available');

  await yieldToEventLoop();
  database.prepare(`INSERT INTO subscriptions (id, user_id, plan, status, bandwidth_used, bandwidth_limit, stream_hours_used, stream_hours_limit, storage_used, storage_limit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uuidv4(), userId, 'pro', 'active', 125.5, 500, 42.3, 200, 11.2, 100);

  console.log('[DB] Sample data seeded.');
  initialized = true;
}

function isDbReady() {
  return initialized;
}

module.exports = { getDb, initDb, isDbReady };
