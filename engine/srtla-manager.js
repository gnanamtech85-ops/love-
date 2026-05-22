const { getDb } = require('../db/init');

let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function generateBondStats(bond, interfaces) {
  const now = new Date().toISOString();
  const ifaceStats = interfaces.map((iface) => {
    const throughput = parseFloat((1 + Math.random() * 49).toFixed(2));
    const latency = parseFloat((5 + Math.random() * 195).toFixed(1));
    const packetLoss = parseFloat((Math.random() * 5).toFixed(2));
    const jitter = parseFloat((0.5 + Math.random() * 10).toFixed(2));
    return {
      id: iface.id,
      name: iface.name,
      type: iface.type,
      throughput,
      latency,
      packetLoss,
      jitter,
      packetsSent: Math.floor(10000 + Math.random() * 50000),
      packetsReceived: Math.floor(9800 + Math.random() * 49500),
      status: Math.random() > 0.08 ? 'active' : 'degraded',
      enabled: iface.enabled === 1
    };
  });
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
      const db = getDb();
      const bond = db.prepare('SELECT * FROM srtla_bonds WHERE id = ?').get(bondId);
      if (!bond) { stopBondMonitoring(bondId); return; }
      const interfaces = db.prepare('SELECT * FROM srtla_interfaces WHERE bond_id = ? ORDER BY priority ASC').all(bondId);
      const stats = generateBondStats(bond, interfaces);
      ioInstance.of('/srtla-monitor').emit('srtla:bond-stats', stats);
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
