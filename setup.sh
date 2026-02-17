#!/bin/bash
set -e

echo "⚡ VidClaw Setup"
echo ""

# Parse arguments
TAILSCALE_ENABLED=false
TAILSCALE_PORT=8443

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tailscale)
      TAILSCALE_ENABLED=true
      if [[ -n "$2" && "$2" =~ ^[0-9]+$ ]]; then
        TAILSCALE_PORT="$2"
        shift
      fi
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

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

# Detect OS
OS="$(uname -s)"

# Resolve tailscale binary path (if needed)
if [ "$TAILSCALE_ENABLED" = "true" ]; then
  TAILSCALE_BIN=$(which tailscale 2>/dev/null || echo "")
  if [ -z "$TAILSCALE_BIN" ]; then
    echo "❌ --tailscale requested but 'tailscale' not found in PATH."
    exit 1
  fi
  echo "🔗 Tailscale integration enabled (port $TAILSCALE_PORT)"
fi

if [ "$OS" = "Darwin" ]; then
  # macOS: install launchd plist
  echo "⚙️  Installing launchd service..."
  PLIST_PATH="$HOME/Library/LaunchAgents/com.vidclaw.plist"
  mkdir -p "$HOME/Library/LaunchAgents"

  if [ "$TAILSCALE_ENABLED" = "true" ]; then
    # Create a wrapper script that registers the Tailscale Serve route
    # before starting the node server. This ensures the route is
    # re-registered on every launch (survives OpenClaw resetOnExit).
    WRAPPER="$DASHBOARD_DIR/start-vidclaw.sh"
    cat > "$WRAPPER" << WRAPPER_EOF
#!/bin/bash
# Re-register Tailscale Serve route (idempotent — safe to run on every start).
# The leading '-' equivalent: we don't exit on failure so the server still starts.
$TAILSCALE_BIN serve --bg --https=$TAILSCALE_PORT http://127.0.0.1:3333 || true
exec $NODE_BIN $DASHBOARD_DIR/server.js
WRAPPER_EOF
    chmod +x "$WRAPPER"
    LAUNCH_CMD="$WRAPPER"
  else
    LAUNCH_CMD=""
  fi

  if [ -n "$LAUNCH_CMD" ]; then
    # Use wrapper script as single program argument
    cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vidclaw</string>
  <key>ProgramArguments</key>
  <array>
    <string>$LAUNCH_CMD</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$DASHBOARD_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$DASHBOARD_DIR/data/vidclaw.log</string>
  <key>StandardErrorPath</key>
  <string>$DASHBOARD_DIR/data/vidclaw.err</string>
</dict>
</plist>
EOF
  else
    cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.vidclaw</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$DASHBOARD_DIR/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$DASHBOARD_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$DASHBOARD_DIR/data/vidclaw.log</string>
  <key>StandardErrorPath</key>
  <string>$DASHBOARD_DIR/data/vidclaw.err</string>
</dict>
</plist>
EOF
  fi

  # Unload first if already loaded (ignore errors)
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load "$PLIST_PATH"
else
  # Linux: install systemd service
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

  # Inject ExecStartPre for Tailscale Serve if enabled.
  # The leading '-' tells systemd to continue even if this command fails,
  # so the server still starts if tailscale is temporarily unavailable.
  if [ "$TAILSCALE_ENABLED" = "true" ]; then
    sudo sed -i "/^ExecStart=/i ExecStartPre=-$TAILSCALE_BIN serve --bg --https=$TAILSCALE_PORT http://127.0.0.1:3333" \
      /etc/systemd/system/vidclaw.service
  fi

  sudo systemctl daemon-reload
  sudo systemctl enable --now vidclaw
fi

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
1. Check for stuck in-progress tasks: GET http://localhost:3333/api/tasks and look for status "in-progress"
2. For each in-progress task: check if a sub-agent completed the work (use sessions_list to find recent sub-agents, check their last message for completion). If done, POST to http://localhost:3333/api/tasks/{id}/complete with { "result": "<summary from sub-agent>" }. If the task has been in-progress for over 10 minutes with no active sub-agent, POST with { "error": "Task timed out — no active sub-agent found" }.
3. Fetch http://localhost:3333/api/tasks/queue via exec (curl)
4. If any tasks returned, pick the FIRST one (highest priority)
5. Mark it as picked up: POST http://localhost:3333/api/tasks/{id}/pickup
6. Spawn a sub-agent with the task: use sessions_spawn with the task title + description as the prompt. If a skill is assigned, tell the sub-agent to read that skill's SKILL.md first.
7. When the sub-agent completes, POST to http://localhost:3333/api/tasks/{id}/complete with { "result": "<summary of what was done>" } or { "error": "<what went wrong>" } if it failed
8. Only process ONE task per heartbeat to avoid overload
HEARTBEAT_BLOCK
fi

echo ""
echo "✅ Dashboard installed and running!"
echo ""
echo "   Local:  http://localhost:3333"

if [ "$TAILSCALE_ENABLED" = "true" ]; then
  TS_HOSTNAME=$(tailscale status --json 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null || echo "your-machine.your-tailnet.ts.net")
  echo "   Tailscale: https://${TS_HOSTNAME}:${TAILSCALE_PORT}/"
fi

if [ "$OS" = "Darwin" ]; then
  echo "   Remote: ssh -L 3333:localhost:3333 $(whoami)@$(hostname | head -1)"
  echo ""
  echo "   Manage: launchctl {load|unload} $PLIST_PATH"
  echo "   Logs:   tail -f $DASHBOARD_DIR/data/vidclaw.log"
else
  echo "   Remote: ssh -L 3333:localhost:3333 $(whoami)@$(hostname -I | awk '{print $1}')"
  echo ""
  echo "   Manage: sudo systemctl {start|stop|restart|status} vidclaw"
  echo "   Logs:   journalctl -u vidclaw -f"
fi
