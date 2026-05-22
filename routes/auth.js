/**
 * StreamCast - Authentication Routes
 * 
 * Handles user registration, login, profile retrieval, and profile updates.
 * Uses bcryptjs for password hashing and JWT for session tokens.
 * 
 * Routes:
 *   POST /register  - Create a new account
 *   POST /login     - Authenticate and receive JWT
 *   GET  /me        - Get current user profile (auth required)
 *   PUT  /profile   - Update profile info (auth required)
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/init');
const authMiddleware = require('../middleware/auth');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// ─── POST /register ─────────────────────────────────────────────────────────────
// Creates a new user account. Validates email format and password length.
router.post('/register', (req, res) => {
  try {
    const { email, password, name } = req.body;

    // ── Input Validation ──
    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Email and password are required.'
      });
    }

    // Simple email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please provide a valid email address.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Password must be at least 6 characters long.'
      });
    }

    const db = getDb();

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({
        error: 'Email taken',
        message: 'An account with this email already exists.'
      });
    }

    // Hash password and create user
    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 10);
    const userName = name || email.split('@')[0];

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, avatar_url, plan)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, email, passwordHash, userName, `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&size=128`, 'starter');

    // Create a default subscription for the new user
    db.prepare(`
      INSERT INTO subscriptions (id, user_id, plan, status, bandwidth_limit, stream_hours_limit, storage_limit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), id, 'starter', 'active', 50, 20, 10);

    // Generate JWT
    const token = jwt.sign(
      { id, email, name: userName, plan: 'starter' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[Auth] New user registered: ${email}`);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { id, email, name: userName, plan: 'starter' }
    });
  } catch (err) {
    console.error('[Auth] Registration error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to create account.' });
  }
});

// ─── POST /login ────────────────────────────────────────────────────────────────
// Authenticates a user with email/password and returns a JWT.
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Email and password are required.'
      });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password.'
      });
    }

    // Compare provided password with stored hash
    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password.'
      });
    }

    // Generate JWT with user info
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, plan: user.plan },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`[Auth] User logged in: ${email}`);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url,
        plan: user.plan
      }
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to authenticate.' });
  }
});

// ─── GET /me ────────────────────────────────────────────────────────────────────
// Returns the authenticated user's profile information.
router.get('/me', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, email, name, avatar_url, plan, created_at, updated_at FROM users WHERE id = ?'
    ).get(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Also fetch stream count for the user
    const streamCount = db.prepare('SELECT COUNT(*) as count FROM streams WHERE user_id = ?').get(req.user.id);

    res.json({
      user: {
        ...user,
        stream_count: streamCount.count
      }
    });
  } catch (err) {
    console.error('[Auth] Profile fetch error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to fetch profile.' });
  }
});

// ─── PUT /profile ───────────────────────────────────────────────────────────────
// Updates the authenticated user's name and/or avatar URL.
router.put('/profile', authMiddleware, (req, res) => {
  try {
    const { name, avatar_url } = req.body;
    const db = getDb();

    // Build dynamic update query based on provided fields
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      params.push(avatar_url);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'No updates',
        message: 'Provide at least one field to update (name, avatar_url).'
      });
    }

    updates.push("updated_at = datetime('now')");
    params.push(req.user.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    // Return updated user
    const user = db.prepare(
      'SELECT id, email, name, avatar_url, plan, created_at, updated_at FROM users WHERE id = ?'
    ).get(req.user.id);

    console.log(`[Auth] Profile updated for user: ${req.user.email}`);

    res.json({
      message: 'Profile updated successfully',
      user
    });
  } catch (err) {
    console.error('[Auth] Profile update error:', err.message);
    res.status(500).json({ error: 'Server error', message: 'Failed to update profile.' });
  }
});

module.exports = router;
