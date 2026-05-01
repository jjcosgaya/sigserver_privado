#!/bin/bash
# Quick setup script for the Scout Relay on a cloud server.
# Usage: bash setup.sh

set -e

echo "=== Scout Relay Setup ==="

# Install Go if not present
if ! command -v go &>/dev/null; then
    echo "[1/4] Installing Go..."
    apt update -qq && apt install -y -qq golang-go
else
    echo "[1/4] Go already installed: $(go version)"
fi

# Create relay directory
echo "[2/4] Setting up relay directory..."
mkdir -p ~/.relay
cd ~/.relay

# If main.go doesn't exist, prompt
if [ ! -f main.go ]; then
    echo "ERROR: Copy the scout-relay directory contents (main.go, go.mod) to ~/.relay/ first."
    echo "  scp scripts/scout-relay/* root@your-server:~/.relay/"
    exit 1
fi

# Build
echo "[3/4] Building relay..."
go mod tidy
go build -o scout-relay .

echo "[4/4] Done! Run with:"
echo "  cd ~/.relay && ./scout-relay -port 3001"
echo ""
echo "Then in another terminal, expose with Cloudflare Tunnel:"
echo "  cloudflared tunnel --url http://localhost:3001"
echo ""
echo "Or with PM2:"
echo "  pm2 start ./scout-relay --name relay -- -port 3001"
