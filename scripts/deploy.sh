#!/usr/bin/env bash
# RectoBoost — deploy to Hostinger VPS
# Usage: bash scripts/deploy.sh
set -euo pipefail

VPS_HOST="31.97.106.177"
VPS_USER="root"
VPS_PORT="22"
SSH_KEY="$HOME/.ssh/rectoboost_vps"
APP_DIR="/var/www/rectoboost"

SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -p $VPS_PORT $VPS_USER@$VPS_HOST"
SCP_CMD="scp -i $SSH_KEY -o StrictHostKeyChecking=no -P $VPS_PORT"

echo "=== RectoBoost Deploy ==="
echo "Target: $VPS_USER@$VPS_HOST:$APP_DIR"
echo ""

# Step 1 — Test connection
echo "[1/7] Testing SSH connection..."
$SSH_CMD "echo OK" || {
  echo ""
  echo "ERROR: Cannot connect to VPS."
  echo "Make sure you added the public key to the VPS:"
  echo ""
  cat "$HOME/.ssh/rectoboost_vps.pub"
  echo ""
  echo "Paste the command above into the hPanel Terminal."
  exit 1
}
echo "      Connected!"

# Step 2 — Prepare VPS (install Node.js + PM2 if needed)
echo "[2/7] Setting up VPS environment..."
$SSH_CMD "bash -s" << 'REMOTE'
set -e
# Install Node.js 20 if not present
if ! command -v node &>/dev/null || [[ "$(node --version)" < "v20" ]]; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# Install PM2 if not present
if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
fi

# Create app directory
mkdir -p /var/www/rectoboost
echo "Node: $(node --version) | NPM: $(npm --version) | PM2: $(pm2 --version)"
REMOTE

# Step 3 — Rsync files
echo "[3/7] Syncing files to VPS..."
rsync -avz --progress \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='logs' \
  --exclude='*.log' \
  --exclude='*.pid' \
  --exclude='.env' \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no -p $VPS_PORT" \
  ./ "$VPS_USER@$VPS_HOST:$APP_DIR/"

# Step 4 — Upload .env (separately, not in git)
echo "[4/7] Uploading .env..."
$SCP_CMD .env "$VPS_USER@$VPS_HOST:$APP_DIR/.env"

# Step 5 — Install deps + generate Prisma + push schema
echo "[5/7] Installing dependencies & migrating DB..."
$SSH_CMD "bash -s" << REMOTE
set -e
cd $APP_DIR
# Install ALL deps (including prisma CLI needed for generate/push)
npm ci
npx prisma generate
npx prisma db push --accept-data-loss
echo "DB schema pushed."
REMOTE

# Step 6 — Seed + sync services (non-fatal — skip if seed already ran)
echo "[6/7] Seeding DB and syncing SMMWIZ services..."
$SSH_CMD "bash -s" << REMOTE
cd $APP_DIR
node prisma/seed.js 2>&1 | tail -5 || echo "(seed skipped — already seeded)"
node scripts/sync-services.js 2>&1 | tail -5 || echo "(sync failed — will retry on app start)"
REMOTE

# Step 7 — Start/restart app with PM2 + health check
echo "[7/7] Starting app with PM2..."
$SSH_CMD "bash -s" << REMOTE
set -e
cd $APP_DIR
pm2 stop rectoboost 2>/dev/null || true
pm2 delete rectoboost 2>/dev/null || true
pm2 start server.js --name rectoboost --time
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true
echo ""
echo "Waiting for app to start..."
sleep 4
# Health check
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 8 || echo "000")
echo "Health check: HTTP $HTTP_STATUS"
if [ "$HTTP_STATUS" = "200" ]; then
  echo "App is healthy!"
else
  echo "WARNING: App may not be responding (HTTP $HTTP_STATUS). Check logs:"
  pm2 logs rectoboost --lines 20 --nostream
fi
echo ""
echo "App status:"
pm2 status rectoboost
REMOTE

echo ""
echo "=== DEPLOY COMPLETE ==="
echo "App URL: http://$VPS_HOST:3000"
echo ""
echo "Useful commands:"
echo "  ssh -i $SSH_KEY $VPS_USER@$VPS_HOST"
echo "  pm2 logs rectoboost --lines 50"
echo "  pm2 status"
echo "  pm2 restart rectoboost"
