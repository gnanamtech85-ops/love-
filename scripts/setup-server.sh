#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
# StreamCast — Fresh Server Setup Script
# Run ONCE on a blank Ubuntu 22.04 server as root
# ─────────────────────────────────────────────

SERVER_IP="${1:-$(curl -4 -s ifconfig.me)}"
REPO_URL="https://github.com/gnanamtech85-ops/love-.git"
APP_DIR="/root/streamcast"
NODE_MAJOR=18

echo ""
echo "============================================"
echo "  StreamCast Server Setup"
echo "  Target: $SERVER_IP"
echo "============================================"
echo ""

# ── 1. System packages ────────────────────────
echo "[1/7] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

echo "[2/7] Installing dependencies (ffmpeg, srt-tools, ufw, curl, git)..."
apt-get install -y -qq \
  ffmpeg \
  srt-tools \
  ufw \
  curl \
  git \
  build-essential

# ── 2. Node.js 18 ─────────────────────────────
echo "[3/7] Installing Node.js $NODE_MAJOR..."
if ! command -v node &>/dev/null; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
echo "   Node: $(node --version)  npm: $(npm --version)"

# ── 3. PM2 ────────────────────────────────────
echo "[4/7] Installing PM2..."
npm install -g pm2 --quiet

# ── 4. Firewall ───────────────────────────────
echo "[5/7] Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    comment 'SSH'
ufw allow 3000/tcp  comment 'StreamCast Web'
ufw allow 1935/tcp  comment 'RTMP ingest'
ufw allow 8001/tcp  comment 'NMS HTTP relay'
ufw allow 9000/udp  comment 'SRT ingest (base)'
ufw --force enable
echo "   Firewall rules applied."

# ── 5. Clone / pull app ───────────────────────
echo "[6/7] Deploying application code..."
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  git pull origin master
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi
npm install --production --quiet
echo "   Code deployed."

# ── 6. Start with PM2 ─────────────────────────
echo "[7/7] Starting application..."
pm2 delete streamcast 2>/dev/null || true
pm2 start server.js --name streamcast
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# ── Done ──────────────────────────────────────
echo ""
echo "============================================"
echo "  SETUP COMPLETE"
echo "  URL:      http://$SERVER_IP:3000"
echo "  RTMP:     rtmp://$SERVER_IP:1935/live/STREAM_KEY"
echo "  SRT:      srt://$SERVER_IP:9000?streamid=STREAM_KEY"
echo "  HLS:      http://$SERVER_IP:3000/live/STREAM_KEY/index.m3u8"
echo "  Manage:   pm2 logs streamcast"
echo "============================================"
