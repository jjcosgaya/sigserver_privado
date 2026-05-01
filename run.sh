#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SERVER_PORT=3000
CONSOLE_PORT=5000
SOCKET_PATH="/tmp/sigserver.sock"

cleanup() {
  echo ""
  echo ">>> Cleaning up..."
  kill $(pgrep -f "cli/index.js" 2>/dev/null) 2>/dev/null || true
  kill $(pgrep -f "console/index.js" 2>/dev/null) 2>/dev/null || true
  kill $(pgrep -f "cloudflared" 2>/dev/null) 2>/dev/null || true
  rm -f "$SOCKET_PATH" 2>/dev/null || true
  rm -f /tmp/cloudflared.log 2>/dev/null || true
  echo ">>> All processes stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM

install_node() {
  echo ">>> Node.js not found. Installing..."
  if command -v nvm &> /dev/null; then
    source "$NVM_DIR/nvm.sh" && nvm install --lts
  elif command -v brew &> /dev/null; then
    brew install node
  else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
  fi
}

install_cloudflared() {
  if ! command -v cloudflared &> /dev/null; then
    echo ">>> Installing cloudflared..."
    ARCH=$(uname -m)
    case "$ARCH" in
      x86_64) ARCH="amd64" ;;
      aarch64|arm64) ARCH="arm64" ;;
    esac
    curl -sL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$ARCH" -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
  fi
}

install_deps() {
  if [ ! -d "node_modules" ]; then
    echo ">>> Installing dependencies..."
    npm install
  fi
}

start_server() {
  echo ">>> Starting game server on port $SERVER_PORT..."
  nohup node cli/index.js > /tmp/sigserver.log 2>&1 &
  SERVER_PID=$!
  sleep 3
  for i in {1..5}; do
    if grep -q "Listening" /tmp/sigserver.log 2>/dev/null; then
      echo ">>> Game server started"
      return 0
    fi
    sleep 1
  done
  if pgrep -f "cli/index.js" > /dev/null; then
    echo ">>> Game server started"
  else
    echo ">>> ERROR: Failed to start game server"
    cat /tmp/sigserver.log
    exit 1
  fi
}

start_console() {
  echo ">>> Starting console on port $CONSOLE_PORT (password: $CONSOLE_PASSWORD)..."
  export CONSOLE_PASSWORD="$CONSOLE_PASSWORD"
  nohup node console/index.js > /tmp/sigconsole.log 2>&1 &
  CONSOLE_PID=$!
  sleep 3
  for i in {1..5}; do
    if grep -q "Console activa" /tmp/sigconsole.log 2>/dev/null; then
      echo ">>> Console started"
      return 0
    fi
    sleep 1
  done
  if pgrep -f "console/index.js" > /dev/null; then
    echo ">>> Console started"
  else
    echo ">>> ERROR: Failed to start console"
    cat /tmp/sigconsole.log
    exit 1
  fi
}

make_public() {
  local port=$1
  local service=$2
  echo ">>> Creating cloudflare tunnel for $service on port $port..."
  /tmp/cloudflared tunnel --url "http://localhost:$port" 2>&1 &
  TUNNEL_PID=$!
  sleep 3

  for i in {1..10}; do
    URL=$(grep -oP 'https://[^ ]+\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | head -1 || true)
    if [ -n "$URL" ]; then
      echo ""
      echo "========================================"
      echo "  $service is now PUBLIC!"
      echo "  URL: $URL"
      echo "========================================"
      return 0
    fi
    sleep 1
  done

  echo ">>> Warning: Could not get tunnel URL, but tunnel may be starting..."
  return 1
}

start_tunnel_loop() {
  local port=$1
  local name=$2
  rm -f /tmp/cloudflared.log
  nohup /tmp/cloudflared tunnel --url "http://localhost:$port" > /tmp/cloudflared.log 2>&1 &
  TUNNEL_PIDS+=($!)

  sleep 4

  local url=""
  for i in {1..15}; do
    url=$(grep -oP 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | head -1 || true)
    [ -n "$url" ] && break
    sleep 1
  done

  if [ -n "$url" ]; then
    TUNNEL_URLS+=("$url")
    echo ""
    echo "========================================"
    echo "  $name is now PUBLIC!"
    echo "  URL: $url"
    echo "========================================"
    if [ "$name" = "Game Server" ]; then
      ws_url="${url/https:\/\//wss://}"
      local sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
      echo ""
      echo "  Sigmally Fixes join link:"
      echo "  $sigmally_link"
      echo ""
    fi
  else
    echo ">>> Could not retrieve tunnel URL for $name"
  fi
}

check_node() {
  if ! command -v node &> /dev/null; then
    install_node
  fi
  node_version=$(node -v)
  echo ">>> Node.js version: $node_version"
}

show_join_info() {
  if [ -n "${TUNNEL_URLS[0]}" ]; then
    ws_url="${TUNNEL_URLS[0]/https:\/\//wss://}"
    sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
  else
    sigmally_link="https://one.sigmally.com?ip=wss://localhost:$SERVER_PORT/sigmally.com"
  fi
  
  echo ""
  echo "========================================"
  echo "  SERVER READY!"
  echo "========================================"
  echo ""
  echo "  Local game server: ws://localhost:$SERVER_PORT/sigmally.com"
  echo "  Local console:     http://localhost:$CONSOLE_PORT"
  echo "  Console password:  admin"
  echo ""
  echo "  Sigmally Fixes link (use this to join):"
  echo "  $sigmally_link"
  echo ""
  echo "  To connect from Delta:"
  echo "  ws://localhost:$SERVER_PORT/sigmally.com"
  echo ""
}

check_node
install_deps
install_cloudflared
start_server
start_console
show_join_info

TUNNEL_PIDS=()
TUNNEL_URLS=()

CONSOLE_PASSWORD="admin"

print_menu() {
  if [ -n "${TUNNEL_URLS[0]}" ]; then
    ws_url="${TUNNEL_URLS[0]/https:\/\//wss://}"
    sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
  else
    sigmally_link="https://one.sigmally.com?ip=wss://localhost:$SERVER_PORT/sigmally.com"
  fi
  
  echo ""
  echo "----------------------------------------"
  echo "  SIG-SERVER CONTROLLER"
  echo "----------------------------------------"
  echo "  [S] Make server public"
  echo "  [C] Make console public"
  echo "  [B] Make both public"
  echo "  [U] Show/refresh URLs"
  echo "  [P] Change console password"
  echo "  [Q] Quit and stop everything"
  echo "----------------------------------------"
  echo ""
  if [ -n "${TUNNEL_URLS[0]}" ]; then
    echo "  Join link: $sigmally_link"
    echo ""
  fi
  echo "  Console password: $CONSOLE_PASSWORD"
  echo ""
}

while true; do
  print_menu
  read -p "Select option [S/C/B/U/P/Q]: " opt

  case "$opt" in
    s|S)
      if [ ${#TUNNEL_URLS[@]} -gt 0 ] && [ -n "${TUNNEL_URLS[0]}" ]; then
        echo ">>> Server is already public!"
      else
        start_tunnel_loop $SERVER_PORT "Game Server"
fi
      echo ""
      echo "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯"
      ;;
    c|C)
      if [ ${#TUNNEL_URLS[@]} -gt 1 ] && [ -n "${TUNNEL_URLS[1]}" ]; then
        echo ">>> Console is already public!"
      else
        start_tunnel_loop $CONSOLE_PORT "Console"
      fi
      echo ""
      echo "========================================"
      ;;
    b|B)
      start_tunnel_loop $SERVER_PORT "Game Server"
      start_tunnel_loop $CONSOLE_PORT "Console"
      echo ""
      echo "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯"
      ;;
    u|U)
      echo ""
      if [ -n "${TUNNEL_URLS[0]}" ]; then
        ws_url="${TUNNEL_URLS[0]/https:\/\//wss://}"
        sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
        echo "  Server: ${TUNNEL_URLS[0]}"
        echo "  Join (Sigmally Fixes): $sigmally_link"
      else
        echo "  Server: Not public (local: ws://localhost:$SERVER_PORT)"
      fi
      if [ -n "${TUNNEL_URLS[1]}" ]; then
        echo "  Console: ${TUNNEL_URLS[1]}"
      else
        echo "  Console: Not public (local: http://localhost:$CONSOLE_PORT)"
      fi
      echo ""
      echo "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯"
      ;;
    p|P)
      echo ""
      read -p "Enter new password: " new_password
      if [ -n "$new_password" ]; then
        CONSOLE_PASSWORD="$new_password"
        echo ">>> Restarting console with new password..."
        pkill -f "console/index.js" 2>/dev/null || true
        sleep 1
        export CONSOLE_PASSWORD="$new_password"
        nohup node console/index.js > /tmp/sigconsole.log 2>&1 &
        sleep 2
        if pgrep -f "console/index.js" > /dev/null; then
          echo ">>> Console restarted with new password: $new_password"
        else
          echo ">>> ERROR: Failed to restart console"
        fi
      else
        echo ">>> Password not changed"
      fi
      echo ""
      echo "========================================"
      ;;
    q|Q)
      cleanup
      ;;
    *)
      echo ">>> Invalid option"
      echo ""
      echo "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯"
      ;;
  esac
done
