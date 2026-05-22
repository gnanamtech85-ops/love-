const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const PLANS = {
  starter: { name: 'Starter', price: 0, bandwidth: 50, streamHours: 20, storage: 10, streams: 1, destinations: 2 },
  pro: { name: 'Pro', price: 49, bandwidth: 500, streamHours: 200, storage: 100, streams: 5, destinations: 10 },
  business: { name: 'Business', price: 149, bandwidth: 2000, streamHours: 800, storage: 500, streams: 20, destinations: 30 },
  enterprise: { name: 'Enterprise', price: 499, bandwidth: 10000, streamHours: 4000, storage: 2000, streams: 100, destinations: 100 }
};

router.get('/plans', (req, res) => {
  res.json({ plans: PLANS });
});

router.get('/subscription', (req, res) => {
  try {
    const db = getDb();
    let sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);
    if (!sub) {
      const id = uuidv4();
      db.prepare(`
        INSERT INTO subscriptions (id, user_id, plan, status, bandwidth_limit, stream_hours_limit, storage_limit)
        VALUES (?, ?, 'starter', 'active', 50, 20, 10)
      `).run(id, req.user.id);
      sub = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id);
    }
    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.id);
    res.json({ subscription: { ...sub, plan_name: user?.plan || 'starter' } });
  } catch (err) {
    console.error('[Billing] Get sub error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/upgrade', (req, res) => {
  try {
    const { plan } = req.body;
    if (!plan || !PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
    const db = getDb();
    const p = PLANS[plan];
    db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, req.user.id);
    db.prepare(`
      UPDATE subscriptions SET plan = ?, bandwidth_limit = ?, stream_hours_limit = ?, storage_limit = ?, status = 'active'
      WHERE user_id = ?
    `).run(plan, p.bandwidth, p.streamHours, p.storage, req.user.id);
    console.log(`[Billing] User ${req.user.email} upgraded to ${plan}`);
    res.json({ message: `Upgraded to ${p.name}`, plan });
  } catch (err) {
    console.error('[Billing] Upgrade error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/invoices', (req, res) => {
  res.json({ invoices: [] });
});

module.exports = router;
