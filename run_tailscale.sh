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
BLUE="\033[0;34m"
DIM="\033[2m"
RESET="\033[0m"

SERVER_PORT=3000
CONSOLE_PORT=5000

print_line() {
  echo -e "${DIM}────────────────────────────────────────${RESET}"
}

print_banner() {
  echo ""
  echo -e "${BLUE}${BOLD} ╔══════════════════════════════════════╗${RESET}"
  echo -e "${BLUE}${BOLD} ║      SIG-SERVER · TAILSCALE FUNNEL   ║${RESET}"
  echo -e "${BLUE}${BOLD} ╚══════════════════════════════════════╝${RESET}"
}

cleanup() {
  echo ""
  echo -e "${YELLOW}${BOLD}Shutting down...${RESET}"
  kill $(pgrep -f "cli/index.js" 2>/dev/null) 2>/dev/null || true
  kill $(pgrep -f "console/index.js" 2>/dev/null) 2>/dev/null || true
  kill $(pgrep -f "tailscale funnel" 2>/dev/null) 2>/dev/null || true
  rm -f /tmp/tailscale-funnel-*.log 2>/dev/null || true
  echo -e "${GREEN}All processes stopped${RESET}"
  echo ""
  exit 0
}

trap cleanup SIGINT SIGTERM

check_tailscale() {
  if ! command -v tailscale &> /dev/null; then
    echo -e "${RED}Tailscale not found.${RESET}"
    echo ""
    echo -e "${YELLOW}Install it first:${RESET}"
    echo -e "  ${DIM}curl -fsSL https://tailscale.com/install.sh | sh${RESET}"
    echo ""
    exit 1
  fi

  local status
  status=$(tailscale status 2>&1)
  if echo "$status" | grep -q "not logged in\|no state\|needs login"; then
    echo -e "${RED}Tailscale is not logged in.${RESET}"
    echo ""
    echo -e "${YELLOW}Run:${RESET} ${BOLD}tailscale up${RESET}"
    echo -e "${DIM}or${RESET}  ${BOLD}tailscale up --authkey <your-key>${RESET}"
    echo ""
    exit 1
  fi

  local version
  version=$(tailscale version | head -1)
  local tailnet
  tailnet=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null || echo "unknown")

  echo -e "${GREEN}Tailscale ${DIM}${version}${RESET}"
  echo -e "${GREEN}Tailnet ${DIM}${tailnet}${RESET}"
}

install_deps() {
  if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${RESET}"
    npm install
  fi
}

start_server() {
  echo -e "${YELLOW}Starting game server on port ${BOLD}$SERVER_PORT${RESET}${YELLOW}...${RESET}"
  nohup node cli/index.js > /tmp/sigserver.log 2>&1 &
  sleep 3
  for i in {1..5}; do
    if grep -q "Listening" /tmp/sigserver.log 2>/dev/null; then
      echo -e "${GREEN}Game server started${RESET}"
      return 0
    fi
    sleep 1
  done
  if pgrep -f "cli/index.js" > /dev/null; then
    echo -e "${GREEN}Game server started${RESET}"
  else
    echo -e "${RED}Failed to start game server${RESET}"
    cat /tmp/sigserver.log
    exit 1
  fi
}

start_console() {
  echo -e "${YELLOW}Starting console on port ${BOLD}$CONSOLE_PORT${RESET}${YELLOW}...${RESET}"
  export CONSOLE_PASSWORD="$CONSOLE_PASSWORD"
  nohup node console/index.js > /tmp/sigconsole.log 2>&1 &
  sleep 3
  for i in {1..5}; do
    if grep -q "Console activa" /tmp/sigconsole.log 2>/dev/null; then
      echo -e "${GREEN}Console started${RESET}"
      return 0
    fi
    sleep 1
  done
  if pgrep -f "console/index.js" > /dev/null; then
    echo -e "${GREEN}Console started${RESET}"
  else
    echo -e "${RED}Failed to start console${RESET}"
    cat /tmp/sigconsole.log
    exit 1
  fi
}

start_funnel() {
  local port=$1
  local name=$2
  local funnel_port=$3
  local log_file="/tmp/tailscale-funnel-${funnel_port}.log"
  rm -f "$log_file"

  echo -e "${YELLOW}Starting Tailscale Funnel for $name (port $port)...${RESET}"

  if [ "$funnel_port" = "443" ]; then
    nohup tailscale funnel --bg $port >> "$log_file" 2>&1 &
  else
    nohup tailscale funnel --bg --https=$funnel_port $port >> "$log_file" 2>&1 &
  fi
  FUNNEL_PIDS+=($!)

  sleep 3

  local url=""
  for i in {1..10}; do
    if [ "$funnel_port" = "443" ]; then
      url=$(grep -oP 'https://[a-zA-Z0-9._-]+\.ts\.net' "$log_file" 2>/dev/null | head -1 || true)
    else
      url=$(grep -oP "https://[a-zA-Z0-9._-]+\.ts\.net:${funnel_port}" "$log_file" 2>/dev/null | head -1 || true)
    fi
    [ -n "$url" ] && break
    sleep 1
  done

  if [ -z "$url" ]; then
    url=$(grep -oP 'https://[a-zA-Z0-9._-]+' "$log_file" 2>/dev/null | tail -1 || true)
  fi

  if [ -n "$url" ]; then
    FUNNEL_URLS+=("$url")
    echo ""
    echo -e "${GREEN}${BOLD}$name is now PUBLIC${RESET}"
    echo -e "${CYAN}  URL: ${BOLD}$url${RESET}"
    if [ "$name" = "Game Server" ]; then
      ws_url="${url/https:\/\//wss://}"
      local sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
      echo -e "${CYAN}  Sigmally: ${BOLD}$sigmally_link${RESET}"
    fi
  else
    echo -e "${RED}Could not retrieve Funnel URL for $name${RESET}"
    echo -e "${DIM}Check log: $log_file${RESET}"
  fi
}

show_join_info() {
  local ws_url="ws://localhost:$SERVER_PORT"
  local sigmally_link="https://one.sigmally.com?ip=ws://localhost:$SERVER_PORT/sigmally.com"

  echo ""
  echo -e "${GREEN}${BOLD} SERVER READY ${RESET}"
  echo ""
  echo -e "  ${CYAN}Local server:   ${BOLD}ws://localhost:$SERVER_PORT/sigmally.com${RESET}"
  echo -e "  ${CYAN}Console:        ${BOLD}http://localhost:$CONSOLE_PORT${RESET} ${DIM}(pass: $CONSOLE_PASSWORD)${RESET}"
  echo ""
  echo -e "  ${BOLD}Sigmally link:${RESET}"
  echo -e "  ${MAGENTA}$sigmally_link${RESET}"
  echo ""
  echo -e "${DIM}Use menu options to expose services via Tailscale Funnel${RESET}"
  print_line
}

print_menu() {
  print_banner
  echo ""
  echo -e "  ${CYAN}[S]${RESET}  Expose server via Funnel"
  echo -e "  ${CYAN}[C]${RESET}  Expose console via Funnel"
  echo -e "  ${CYAN}[B]${RESET}  Expose both via Funnel"
  echo -e "  ${CYAN}[U]${RESET}  Show URLs"
  echo -e "  ${CYAN}[P]${RESET}  Change console password"
  echo -e "  ${RED}[Q]${RESET}  Quit"
  echo ""

  if [ -n "${FUNNEL_URLS[0]}" ]; then
    ws_url="${FUNNEL_URLS[0]/https:\/\//wss://}"
    sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
    echo -e "  ${GREEN}Server:   ${DIM}public${RESET} ${CYAN}${FUNNEL_URLS[0]}${RESET}"
  else
    ws_url="ws://localhost:$SERVER_PORT"
    sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
    echo -e "  ${DIM}Server:   local${RESET}"
  fi
  echo -e "  ${GREEN}Join:     ${MAGENTA}${BOLD}$sigmally_link${RESET}"

  if [ -n "${FUNNEL_URLS[1]}" ]; then
    echo -e "  ${GREEN}Console:  ${DIM}public${RESET} ${CYAN}${FUNNEL_URLS[1]}${RESET}"
  else
    echo -e "  ${DIM}Console:  local (http://localhost:$CONSOLE_PORT)${RESET}"
  fi

  echo ""
  echo -e "  ${DIM}Password: ${BOLD}$CONSOLE_PASSWORD${RESET}"
  echo ""
  print_line
}

CONSOLE_PASSWORD="admin"

check_tailscale
install_deps
start_server
start_console
show_join_info

FUNNEL_PIDS=()
FUNNEL_URLS=()

while true; do
  print_menu
  read -p " > " opt

  case "$opt" in
    s|S)
      if [ ${#FUNNEL_URLS[@]} -gt 0 ] && [ -n "${FUNNEL_URLS[0]}" ]; then
        echo -e "${YELLOW}Server is already exposed${RESET}"
      else
        start_funnel $SERVER_PORT "Game Server"
      fi
      ;;
    c|C)
      if [ ${#FUNNEL_URLS[@]} -gt 1 ] && [ -n "${FUNNEL_URLS[1]}" ]; then
        echo -e "${YELLOW}Console is already exposed${RESET}"
      else
        start_funnel $CONSOLE_PORT "Console"
      fi
      ;;
    b|B)
      start_funnel $SERVER_PORT "Game Server"
      start_funnel $CONSOLE_PORT "Console"
      ;;
    u|U)
      echo ""
      if [ -n "${FUNNEL_URLS[0]}" ]; then
        ws_url="${FUNNEL_URLS[0]/https:\/\//wss://}"
        sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
        echo -e "  ${GREEN}Server:   ${DIM}public${RESET} ${CYAN}${FUNNEL_URLS[0]}${RESET}"
      else
        ws_url="ws://localhost:$SERVER_PORT"
        sigmally_link="https://one.sigmally.com?ip=${ws_url}/sigmally.com"
        echo -e "  ${DIM}Server:   local${RESET}"
      fi
      echo -e "  ${GREEN}Join:     ${MAGENTA}${BOLD}$sigmally_link${RESET}"
      if [ -n "${FUNNEL_URLS[1]}" ]; then
        echo -e "  ${GREEN}Console:  ${DIM}public${RESET} ${CYAN}${FUNNEL_URLS[1]}${RESET}"
      else
        echo -e "  ${DIM}Console:  local${RESET}"
      fi
      echo ""
      ;;
    p|P)
      echo ""
      read -s -p " New password: " new_password
      echo ""
      if [ -n "$new_password" ]; then
        CONSOLE_PASSWORD="$new_password"
        echo -e "${YELLOW}Restarting console...${RESET}"
        pkill -f "console/index.js" 2>/dev/null || true
        sleep 1
        export CONSOLE_PASSWORD="$new_password"
        nohup node console/index.js > /tmp/sigconsole.log 2>&1 &
        sleep 2
        if pgrep -f "console/index.js" > /dev/null; then
          echo -e "${GREEN}Console restarted${RESET}"
        else
          echo -e "${RED}Failed to restart console${RESET}"
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
