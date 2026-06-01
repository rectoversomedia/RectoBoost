#!/usr/bin/env bash
set -euo pipefail

# Run from repo root
cd "$(dirname "$0")/.."

echo "Starting RectoBoost local dev setup..."

# Check Docker
echo "Waiting for Postgres to become ready..."
USE_SQLITE=0
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Falling back to SQLite local DB for development."
  USE_SQLITE=1
else
  # Start or create Postgres container
  CONTAINER_NAME=rectoboost-postgres
  if [ -z "$(docker ps -a -q -f name=$CONTAINER_NAME)" ]; then
    echo "Creating Postgres container..."
    docker run --name $CONTAINER_NAME -e POSTGRES_PASSWORD=recto_local -e POSTGRES_USER=recto -e POSTGRES_DB=rectoboost -p 5432:5432 -d postgres:15
  else
    RUNNING=$(docker inspect -f '{{.State.Running}}' $CONTAINER_NAME 2>/dev/null || echo "false")
    if [ "$RUNNING" != "true" ]; then
      echo "Starting existing Postgres container..."
      docker start $CONTAINER_NAME
    else
      echo "Postgres container already running"
    fi
  fi

  # Wait for Postgres to be ready
  echo "Waiting for Postgres to become ready..."
  for i in {1..60}; do
    if docker exec $CONTAINER_NAME pg_isready -U recto >/dev/null 2>&1; then
      echo "Postgres is ready"
      break
    fi
    sleep 1
  done
fi

# Create .env if missing
if [ ! -f .env ]; then
  echo "Creating .env for local dev"
  if [ "$USE_SQLITE" -eq 1 ]; then
    cat > .env <<'EOF'
DATABASE_URL=file:./dev.db
NEXT_PUBLIC_APP_URL=http://localhost:3000
SMMWIZ_API_KEY=demo-key
SMMWIZ_API_URL=https://smmwiz.com/api/v2
PAYMENT_PROVIDER_MODE=manual
EOF
  else
    cat > .env <<'EOF'
DATABASE_URL=postgresql://recto:recto_local@127.0.0.1:5432/rectoboost
NEXT_PUBLIC_APP_URL=http://localhost:3000
SMMWIZ_API_KEY=demo-key
SMMWIZ_API_URL=https://smmwiz.com/api/v2
PAYMENT_PROVIDER_MODE=manual
EOF
  fi
else
  echo ".env already exists, leaving it intact"
fi

# Install dependencies
echo "Installing npm dependencies (this may take a few minutes)..."
npm ci

# Generate Prisma client
echo "Generating Prisma client..."
if [ "$USE_SQLITE" -eq 1 ]; then
  echo "Generating Prisma client for SQLite schema..."
  npm run db:generate --silent || npx prisma generate --schema=prisma/schema.sqlite.prisma
else
  npm run db:generate
fi

# Apply schema to DB (push)
echo "Applying Prisma schema to DB (prisma db push)..."
npx prisma db push ${USE_SQLITE:+--schema=prisma/schema.sqlite.prisma}

# Seed data
echo "Seeding database..."
npm run db:seed || true

# Start server in background
echo "Starting server.js in background (logs -> server.log)..."
nohup node server.js > server.log 2>&1 &
PID=$!
echo $PID > server.pid
sleep 1

if ps -p $PID > /dev/null 2>&1; then
  echo "Server started (PID: $PID)"
  echo "Run 'tail -f server.log' to follow logs"
else
  echo "Server failed to start. Check server.log for details." >&2
  exit 1
fi

# Quick curl test command
echo
echo "Run this to test login:"
echo "curl -v -X POST http://127.0.0.1:3000/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"test@rectoboost.com\",\"password\":\"rectoboost\"}'"

echo "Local dev setup complete."
