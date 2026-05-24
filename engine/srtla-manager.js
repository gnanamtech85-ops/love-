const { getDb } = require('../db/init');

let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function generateBondStats(bond, interfaces) {
  const now = new Date().toISOString();
  const ifaceStats = interfaces.map((iface) => ({
    id: iface.id,
    name: iface.name,
    type: iface.type,
    throughput: iface.throughput || 0,
    latency: iface.latency || 0,
    packetLoss: iface.packet_loss || 0,
    jitter: iface.jitter || 0,
    packetsSent: iface.packets_sent || 0,
    packetsReceived: iface.packets_received || 0,
    status: iface.status || 'idle',
    enabled: iface.enabled === 1
  }));
  const totalThroughput = parseFloat(
    ifaceStats.reduce((sum, i) => sum + i.throughput, 0).toFixed(2)
  );
  return {
    bondId: bond.id,
    mode: bond.mode,
    totalThroughput,
    interfaces: ifaceStats,
    timestamp: now
  };
}

const monitors = new Map();

function startBondMonitoring(bondId) {
  if (monitors.has(bondId)) return;
  const interval = setInterval(() => {
    if (ioInstance) {
      try {
        const db = getDb();
        if (!db) return;
        const bond = db.prepare('SELECT * FROM srtla_bonds WHERE id = ?').get(bondId);
        if (!bond) { stopBondMonitoring(bondId); return; }
        const interfaces = db.prepare('SELECT * FROM srtla_interfaces WHERE bond_id = ? ORDER BY priority ASC').all(bondId);
        const stats = generateBondStats(bond, interfaces);
        ioInstance.of('/srtla-monitor').emit('srtla:bond-stats', stats);
      } catch (e) {
        // DB not ready
      }
    }
  }, 2000);
  monitors.set(bondId, interval);
}

function stopBondMonitoring(bondId) {
  if (monitors.has(bondId)) {
    clearInterval(monitors.get(bondId));
    monitors.delete(bondId);
  }
}

module.exports = { setIo, generateBondStats, startBondMonitoring, stopBondMonitoring };
