# Scout Relay Server

WebSocket-to-WebSocket relay proxy with **Chrome TLS fingerprint impersonation** using Go + [utls](https://github.com/refraction-networking/utls).

This solves the problem where Cloudflare blocks WebSocket connections from non-browser TLS clients (JA3/JA4 fingerprinting). The relay impersonates Chrome's exact TLS fingerprint so the game server accepts the connection.

## Setup on cloud server

```bash
# 1. Install Go (if not already installed)
sudo apt update && sudo apt install -y golang-go

# 2. Copy the scout-relay/ directory to the server
scp -r scripts/scout-relay/ root@your-server:~/.relay/

# 3. On the server: build
cd ~/.relay
go mod tidy
go build -o scout-relay .

# 4. Run
./scout-relay -port 3001

# 5. Expose with Cloudflare Tunnel (in another terminal)
cloudflared tunnel --url http://localhost:3001
```

## Usage in the userscript

1. Install `sigfixes_extended.js` as a Tampermonkey/Violentmonkey userscript
2. Open Sigmally → Settings panel → **Scout Vision** section
3. Enable **Scout Vision**
4. Set **Relay server URL** to: `wss://your-tunnel.trycloudflare.com/relay`
5. Choose which directions to enable (N, S, E, W, NE, NW, SE, SW)
6. Adjust **Scout distance** as needed

## How it works

```
Browser (userscript)
  ↓ WebSocket (wss:// via Cloudflare Tunnel)
Relay Server (Go + utls)
  ↓ WebSocket with Chrome TLS fingerprint
Game Server (eu0.sigmally.com)
```

The relay is transparent: it receives binary WebSocket messages from the userscript and forwards them to the game server, and vice versa. The key difference from a regular proxy is that the outbound connection to the game server uses `utls.HelloChrome_Auto` to impersonate Chrome's TLS fingerprint.

## Running with PM2

```bash
# Build first
go build -o scout-relay .

# Run with PM2
pm2 start ./scout-relay --name relay -- -port 3001
pm2 save
```
