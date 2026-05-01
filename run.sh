#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
BOLD="\033[1m"
CYAN="\033[0;36m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
MAGENTA="\033[0;35m"
DIM="\033[2m"
RESET="\033[0m"

SERVER_PORT=3000
CONSOLE_PORT=5000
SOCKET_PATH="/tmp/sigserver.sock"

print_line() {
  echo -e "${DIM}────────────────────────────────────────${RESET}"
}

print_banner() {
  echo ""
  echo -e "${CYAN}${BOLD} ╔══════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}${BOLD} ║          SIG-SERVER CONTROLLER       ║${RESET}"
  echo -e "${CYAN}${BOLD} ╚══════════════════════════════════════╝${RESET}"
}

cleanup() {
  echo ""
  echo -e "${YELLOW}${BOLD}⚡ Shutting down...${RESET}"
  kill $(pgrep -f "cli/index.js" 2>/dev/null) 2>/dev/null || true
  kill $(pgrep -f "console/index.js" 2>/dev/null) 2>/dev/null || true
  kill $(pgrep -f "cloudflared" 2>/dev/null) 2>/dev/null || true
  rm -f "$SOCKET_PATH" 2>/dev/null || true
  rm -f /tmp/cloudflared.log 2>/dev/null || true
  echo -e "${GREEN}✓ All processes stopped${RESET}"
  echo ""
  exit 0
}

trap cleanup SIGINT SIGTERM

install_node() {
  echo -e "${YELLOW}⚡ Node.js not found, installing...${RESET}"
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
    echo -e "${YELLOW}⚡ Installing cloudflared...${RESET}"
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
    echo -e "${YELLOW}⚡ Installing dependencies...${RESET}"
    npm install
  fi
}

start_server() {
  echo -e "${YELLOW}⚡ Starting game server on port ${BOLD}$SERVER_PORT${RESET}${YELLOW}...${RESET}"
  nohup node cli/index.js > /tmp/sigserver.log 2>&1 &
  SERVER_PID=$!
  sleep 3
  for i in {1..5}; do
    if grep -q "Listening" /tmp/sigserver.log 2>/dev/null; then
      echo -e "${GREEN}✓ Game server started${RESET}"
      return 0
    fi
    sleep 1
  done
  if pgrep -f "cli/index.js" > /dev/null; then
    echo -e "${GREEN}✓ Game server started${RESET}"
  else
    echo -e "${RED}✗ Failed to start game server${RESET}"
    cat /tmp/sigserver.log
    exit 1
  fi
}

start_console() {
  echo -e "${YELLOW}⚡ Starting console on port ${BOLD}$CONSOLE_PORT${RESET}${YELLOW}...${RESET}"
  export CONSOLE_PASSWORD="$CONSOLE_PASSWORD"
  nohup node console/index.js > /tmp/sigconsole.log 2>&1 &
  CONSOLE_PID=$!
  sleep 3
  for i in {1..5}; do
    if grep -q "Console activa" /tmp/sigconsole.log 2>/dev/null; then
      echo -e "${GREEN}✓ Console started${RESET}"
      return 0
    fi
    sleep 1
  done
  if pgrep -f "console/index.js" > /dev/null; then
    echo -e "${GREEN}✓ Console started${RESET}"
  else
    echo -e "${RED}✗ Failed to start console${RESET}"
    cat /tmp/sigconsole.log
    exit 1
  fi
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
    echo -e "${GREEN}${BOLD}✓ $name is now PUBLIC!${RESET}"
    echo -e "${CYAN}  URL: ${BOLD}$url${RESET}"
    if [ "$name" = "Game Server" ]; then
      ws_url="${url/https:\/\//wss://}"
      local sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
      echo -e "${CYAN}  Sigmally: ${BOLD}$sigmally_link${RESET}"
    fi
  else
    echo -e "${RED}✗ Could not retrieve tunnel URL for $name${RESET}"
  fi
}

check_node() {
  if ! command -v node &> /dev/null; then
    install_node
  fi
  node_version=$(node -v)
  echo -e "${GREEN}✓ Node.js ${DIM}$node_version${RESET}"
}

show_join_info() {
  local ws_url="ws://localhost:$SERVER_PORT"
  local sigmally_link="https://one.sigmally.com?ip=ws://localhost:$SERVER_PORT/sigmally.com"

  echo ""
  echo -e "${GREEN}${BOLD} ╔══════════════════════════════════════╗${RESET}"
  echo -e "${GREEN}${BOLD} ║          SERVER READY ✓              ║${RESET}"
  echo -e "${GREEN}${BOLD} ╚══════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  ${CYAN}Local server:   ${BOLD}ws://localhost:$SERVER_PORT/sigmally.com${RESET}"
  echo -e "  ${CYAN}Console:        ${BOLD}http://localhost:$CONSOLE_PORT${RESET} ${DIM}(pass: $CONSOLE_PASSWORD)${RESET}"
  echo ""
  echo -e "  ${BOLD}Sigmally Fixes link:${RESET}"
  echo -e "  ${MAGENTA}$sigmally_link${RESET}"
  echo ""
  print_line
}

print_menu() {
  print_banner
  echo ""
  echo -e "  ${CYAN}[S]${RESET}  Make server public"
  echo -e "  ${CYAN}[C]${RESET}  Make console public"
  echo -e "  ${CYAN}[B]${RESET}  Make both public"
  echo -e "  ${CYAN}[U]${RESET}  Show URLs"
  echo -e "  ${CYAN}[P]${RESET}  Change console password"
  echo -e "  ${RED}[Q]${RESET}  Quit"
  echo ""

  if [ -n "${TUNNEL_URLS[0]}" ]; then
    ws_url="${TUNNEL_URLS[0]/https:\/\//wss://}"
    sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
    echo -e "  ${GREEN}Server:   ${DIM}● public${RESET} ${CYAN}${TUNNEL_URLS[0]}${RESET}"
  else
    ws_url="ws://localhost:$SERVER_PORT"
    sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
    echo -e "  ${DIM}Server:   ○ local${RESET}"
  fi
  echo -e "  ${GREEN}Join:     ${MAGENTA}${BOLD}$sigmally_link${RESET}"

  if [ -n "${TUNNEL_URLS[1]}" ]; then
    echo -e "  ${GREEN}Console:  ${DIM}● public${RESET} ${CYAN}${TUNNEL_URLS[1]}${RESET}"
  else
    echo -e "  ${DIM}Console:  ○ local (http://localhost:$CONSOLE_PORT)${RESET}"
  fi

  echo ""
  echo -e "  ${DIM}Password: ${BOLD}$CONSOLE_PASSWORD${RESET}"
  echo ""
  print_line
}

CONSOLE_PASSWORD="admin"

check_node
install_deps
install_cloudflared
start_server
start_console
show_join_info

TUNNEL_PIDS=()
TUNNEL_URLS=()

while true; do
  print_menu
  read -p " > " opt

  case "$opt" in
    s|S)
      if [ ${#TUNNEL_URLS[@]} -gt 0 ] && [ -n "${TUNNEL_URLS[0]}" ]; then
        echo -e "${YELLOW}Server is already public${RESET}"
      else
        start_tunnel_loop $SERVER_PORT "Game Server"
      fi
      ;;
    c|C)
      if [ ${#TUNNEL_URLS[@]} -gt 1 ] && [ -n "${TUNNEL_URLS[1]}" ]; then
        echo -e "${YELLOW}Console is already public${RESET}"
      else
        start_tunnel_loop $CONSOLE_PORT "Console"
      fi
      ;;
    b|B)
      start_tunnel_loop $SERVER_PORT "Game Server"
      start_tunnel_loop $CONSOLE_PORT "Console"
      ;;
    u|U)
      echo ""
      if [ -n "${TUNNEL_URLS[0]}" ]; then
        ws_url="${TUNNEL_URLS[0]/https:\/\//wss://}"
        sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
        echo -e "  ${GREEN}Server:   ${DIM}● public${RESET} ${CYAN}${TUNNEL_URLS[0]}${RESET}"
      else
        ws_url="ws://localhost:$SERVER_PORT"
        sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
        echo -e "  ${DIM}Server:   ○ local${RESET}"
      fi
      echo -e "  ${GREEN}Join:     ${MAGENTA}${BOLD}$sigmally_link${RESET}"
      if [ -n "${TUNNEL_URLS[1]}" ]; then
        echo -e "  ${GREEN}Console:  ${DIM}● public${RESET} ${CYAN}${TUNNEL_URLS[1]}${RESET}"
      else
        echo -e "  ${DIM}Console:  ○ local${RESET}"
      fi
      echo ""
      ;;
    p|P)
      echo ""
      read -s -p " New password: " new_password
      echo ""
      if [ -n "$new_password" ]; then
        CONSOLE_PASSWORD="$new_password"
        echo -e "${YELLOW}⚡ Restarting console...${RESET}"
        pkill -f "console/index.js" 2>/dev/null || true
        sleep 1
        export CONSOLE_PASSWORD="$new_password"
        nohup node console/index.js > /tmp/sigconsole.log 2>&1 &
        sleep 2
        if pgrep -f "console/index.js" > /dev/null; then
          echo -e "${GREEN}✓ Console restarted${RESET}"
        else
          echo -e "${RED}✗ Failed to restart console${RESET}"
        fi
      else
        echo -e "${DIM}Password unchanged${RESET}"
      fi
      echo ""
      ;;
    q|Q)
      cleanup
      ;;
    *)
      echo -e "${RED}Invalid option${RESET}"
      ;;
  esac
done
