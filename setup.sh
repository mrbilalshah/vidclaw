#!/bin/bash
set -e

echo "⚡ VidClaw Setup"
echo ""

# Detect workspace path
DASHBOARD_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN=$(which node 2>/dev/null || echo "/usr/bin/node")

if [ ! -f "$DASHBOARD_DIR/server.js" ]; then
  echo "❌ server.js not found. Run this script from the dashboard directory."
  exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
cd "$DASHBOARD_DIR"
npm install --production=false

# Build frontend
echo "🔨 Building frontend..."
npm run build

# Create data directory
mkdir -p "$DASHBOARD_DIR/data"

# Install systemd service
echo "⚙️  Installing systemd service..."
sudo tee /etc/systemd/system/vidclaw.service > /dev/null << EOF
[Unit]
Description=VidClaw
After=network.target

[Service]
Type=simple
WorkingDirectory=$DASHBOARD_DIR
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now vidclaw

# Add task queue check to HEARTBEAT.md
WORKSPACE_DIR="$(dirname "$DASHBOARD_DIR")"
HEARTBEAT="$WORKSPACE_DIR/HEARTBEAT.md"

if [ -f "$HEARTBEAT" ] && grep -q "Task Queue Check" "$HEARTBEAT" 2>/dev/null; then
  echo "📋 HEARTBEAT.md already has task queue config, skipping."
else
  echo "📋 Adding task queue check to HEARTBEAT.md..."
  cat >> "$HEARTBEAT" << 'HEARTBEAT_BLOCK'

## Task Queue Check
0. Record heartbeat: POST http://localhost:3333/api/heartbeat via exec (curl -X POST)
1. Fetch http://localhost:3333/api/tasks/queue via exec (curl)
2. If any tasks returned, pick the FIRST one (highest priority)
3. Mark it as picked up: POST http://localhost:3333/api/tasks/{id}/pickup
4. Spawn a sub-agent with the task: use sessions_spawn with the task title + description as the prompt. If a skill is assigned, tell the sub-agent to read that skill's SKILL.md first.
5. When the sub-agent completes, POST to http://localhost:3333/api/tasks/{id}/complete with { "result": "<summary of what was done>" } or { "error": "<what went wrong>" } if it failed
6. Only process ONE task per heartbeat to avoid overload
HEARTBEAT_BLOCK
fi

echo ""
echo "✅ Dashboard installed and running!"
echo ""
echo "   Local:  http://localhost:3333"
echo "   Remote: ssh -L 3333:localhost:3333 $(whoami)@$(hostname -I | awk '{print $1}')"
echo ""
echo "   Manage: sudo systemctl {start|stop|restart|status} vidclaw"
echo "   Logs:   journalctl -u vidclaw -f"
