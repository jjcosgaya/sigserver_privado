// Scout Relay Server — WS-to-WS proxy with Chrome TLS + HTTP fingerprint impersonation.
//
// Accepts WebSocket connections from the userscript, opens a WebSocket to the
// Sigmally game server using:
//   - utls for Chrome TLS fingerprint (JA3)
//   - Manually crafted HTTP upgrade with Chrome's exact header order (JA4H)
//   - Simple WebSocket binary framing (no gorilla for the game side)
//
// Build:   go build -o scout-relay .
// Run:     ./scout-relay [-port 3001] [-max 50]
// Behind Cloudflare Tunnel:
//   cloudflared tunnel --url http://localhost:3001
//
// Client connects to:
//   wss://your-tunnel.trycloudflare.com/relay?target=wss://eu0.sigmally.com/ws/

package main

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	utls "github.com/refraction-networking/utls"
	"golang.org/x/net/proxy"
)

var (
	port           = flag.Int("port", 3001, "Listen port")
	maxConnections = flag.Int("max", 50, "Max simultaneous connections")
	proxyAddr      = flag.String("proxy", "", "SOCKS5 proxy (e.g. socks5://user:pass@host:port)")
	active         int64
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ---------- Simple WebSocket framing for game-side connection ----------

// GameConn wraps a TLS connection with manual WebSocket framing.
// Only supports binary and close frames (sufficient for Sigmally).
type GameConn struct {
	conn   net.Conn
	reader *bufio.Reader
	wmu    sync.Mutex // protects writes
}

// ReadMessage reads one WebSocket frame. Handles ping by auto-responding pong.
func (g *GameConn) ReadMessage() (int, []byte, error) {
	for {
		hdr := make([]byte, 2)
		if _, err := io.ReadFull(g.reader, hdr); err != nil {
			return 0, nil, err
		}

		opcode := int(hdr[0] & 0x0F)
		masked := hdr[1]&0x80 != 0
		payloadLen := uint64(hdr[1] & 0x7F)

		if payloadLen == 126 {
			ext := make([]byte, 2)
			if _, err := io.ReadFull(g.reader, ext); err != nil {
				return 0, nil, err
			}
			payloadLen = uint64(binary.BigEndian.Uint16(ext))
		} else if payloadLen == 127 {
			ext := make([]byte, 8)
			if _, err := io.ReadFull(g.reader, ext); err != nil {
				return 0, nil, err
			}
			payloadLen = binary.BigEndian.Uint64(ext)
		}

		var maskKey [4]byte
		if masked {
			if _, err := io.ReadFull(g.reader, maskKey[:]); err != nil {
				return 0, nil, err
			}
		}

		payload := make([]byte, payloadLen)
		if payloadLen > 0 {
			if _, err := io.ReadFull(g.reader, payload); err != nil {
				return 0, nil, err
			}
			if masked {
				for i := range payload {
					payload[i] ^= maskKey[i%4]
				}
			}
		}

		switch opcode {
		case 8: // close
			return websocket.CloseMessage, payload, io.EOF
		case 9: // ping → auto pong
			_ = g.writeFrame(10, payload)
			continue
		case 10: // pong → ignore
			continue
		case 1:
			return websocket.TextMessage, payload, nil
		case 2:
			return websocket.BinaryMessage, payload, nil
		default:
			continue
		}
	}
}

// WriteMessage writes a masked WebSocket frame (client→server must be masked).
func (g *GameConn) WriteMessage(msgType int, data []byte) error {
	opcode := byte(2) // binary
	if msgType == websocket.TextMessage {
		opcode = 1
	} else if msgType == websocket.CloseMessage {
		opcode = 8
	}
	return g.writeFrame(int(opcode), data)
}

func (g *GameConn) writeFrame(opcode int, data []byte) error {
	g.wmu.Lock()
	defer g.wmu.Unlock()

	frame := []byte{0x80 | byte(opcode)}

	// Client frames MUST be masked
	var maskKey [4]byte
	rand.Read(maskKey[:])

	n := len(data)
	if n < 126 {
		frame = append(frame, byte(n)|0x80)
	} else if n < 65536 {
		frame = append(frame, 126|0x80)
		lb := make([]byte, 2)
		binary.BigEndian.PutUint16(lb, uint16(n))
		frame = append(frame, lb...)
	} else {
		frame = append(frame, 127|0x80)
		lb := make([]byte, 8)
		binary.BigEndian.PutUint64(lb, uint64(n))
		frame = append(frame, lb...)
	}

	frame = append(frame, maskKey[:]...)
	masked := make([]byte, n)
	for i, b := range data {
		masked[i] = b ^ maskKey[i%4]
	}
	frame = append(frame, masked...)

	_, err := g.conn.Write(frame)
	return err
}

func (g *GameConn) Close() error {
	return g.conn.Close()
}

// ---------- WebSocket accept key computation ----------

func wsAcceptKey(key string) string {
	h := sha1.New()
	h.Write([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

// ---------- Dial game server with Chrome TLS + HTTP fingerprint ----------

func dialGameWS(targetURL string) (*GameConn, error) {
	u, err := url.Parse(targetURL)
	if err != nil {
		return nil, fmt.Errorf("parse URL: %w", err)
	}

	host := u.Hostname()
	p := u.Port()
	if p == "" {
		if u.Scheme == "wss" || u.Scheme == "https" {
			p = "443"
		} else {
			p = "80"
		}
	}

	// 1. TCP connect (optionally through SOCKS5 proxy)
	addr := host + ":" + p
	var tcpConn net.Conn
	if *proxyAddr != "" {
		pu, perr := url.Parse(*proxyAddr)
		if perr != nil {
			return nil, fmt.Errorf("parse proxy URL: %w", perr)
		}
		var auth *proxy.Auth
		if pu.User != nil {
			pw, _ := pu.User.Password()
			auth = &proxy.Auth{User: pu.User.Username(), Password: pw}
		}
		socksDialer, perr := proxy.SOCKS5("tcp", pu.Host, auth, &net.Dialer{Timeout: 15 * time.Second})
		if perr != nil {
			return nil, fmt.Errorf("SOCKS5 setup: %w", perr)
		}
		tcpConn, err = socksDialer.Dial("tcp", addr)
		if err != nil {
			return nil, fmt.Errorf("SOCKS5 dial: %w", err)
		}
	} else {
		tcpConn, err = net.DialTimeout("tcp", addr, 10*time.Second)
		if err != nil {
			return nil, fmt.Errorf("TCP dial: %w", err)
		}
	}

	// 2. TLS handshake with Chrome fingerprint + HTTP/1.1 ALPN only
	tlsConn := utls.UClient(tcpConn, &utls.Config{
		ServerName: host,
	}, utls.HelloCustom)

	spec, err := utls.UTLSIdToSpec(utls.HelloChrome_Auto)
	if err != nil {
		tcpConn.Close()
		return nil, fmt.Errorf("utls spec: %w", err)
	}
	for _, ext := range spec.Extensions {
		if alpn, ok := ext.(*utls.ALPNExtension); ok {
			alpn.AlpnProtocols = []string{"http/1.1"}
			break
		}
	}
	if err := tlsConn.ApplyPreset(&spec); err != nil {
		tcpConn.Close()
		return nil, fmt.Errorf("apply preset: %w", err)
	}
	if err := tlsConn.Handshake(); err != nil {
		tcpConn.Close()
		return nil, fmt.Errorf("TLS handshake: %w", err)
	}

	// 3. Manually craft HTTP upgrade with Chrome's exact header order
	keyBytes := make([]byte, 16)
	rand.Read(keyBytes)
	wsKey := base64.StdEncoding.EncodeToString(keyBytes)

	path := u.Path
	if path == "" {
		path = "/"
	}
	if u.RawQuery != "" {
		path += "?" + u.RawQuery
	}

	// Header order matches Chrome's WebSocket upgrade request exactly.
	// Includes Sec-Fetch-* (Fetch Metadata) and Sec-Ch-Ua (Client Hints)
	// which Chrome always sends and Cloudflare may validate.
	req := "GET " + path + " HTTP/1.1\r\n" +
		"Host: " + host + "\r\n" +
		"Connection: Upgrade\r\n" +
		"Pragma: no-cache\r\n" +
		"Cache-Control: no-cache\r\n" +
		"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36\r\n" +
		"Upgrade: websocket\r\n" +
		"Origin: https://one.sigmally.com\r\n" +
		"Sec-WebSocket-Version: 13\r\n" +
		"Accept-Encoding: gzip, deflate, br, zstd\r\n" +
		"Accept-Language: en-US,en;q=0.9\r\n" +
		"Sec-WebSocket-Key: " + wsKey + "\r\n" +
		"Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits\r\n" +
		"Sec-Fetch-Dest: websocket\r\n" +
		"Sec-Fetch-Mode: websocket\r\n" +
		"Sec-Fetch-Site: cross-site\r\n" +
		"Sec-Ch-Ua: \"Chromium\";v=\"131\", \"Google Chrome\";v=\"131\", \"Not_A Brand\";v=\"24\"\r\n" +
		"Sec-Ch-Ua-Mobile: ?0\r\n" +
		"Sec-Ch-Ua-Platform: \"Windows\"\r\n" +
		"\r\n"

	if _, err := tlsConn.Write([]byte(req)); err != nil {
		tlsConn.Close()
		return nil, fmt.Errorf("write upgrade: %w", err)
	}

	// 4. Read HTTP response
	reader := bufio.NewReaderSize(tlsConn, 4096)
	fakeReq, _ := http.NewRequest("GET", targetURL, nil)
	resp, err := http.ReadResponse(reader, fakeReq)
	if err != nil {
		tlsConn.Close()
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != 101 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		resp.Body.Close()
		// Log ALL response headers for debugging
		log.Printf("[diag] Response status: %s", resp.Status)
		for k, v := range resp.Header {
			log.Printf("[diag]   %s: %s", k, strings.Join(v, ", "))
		}
		if len(body) > 0 {
			log.Printf("[diag] Body: %s", string(body))
		}
		tlsConn.Close()
		return nil, fmt.Errorf("upgrade %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Verify Sec-WebSocket-Accept
	expected := wsAcceptKey(wsKey)
	if resp.Header.Get("Sec-WebSocket-Accept") != expected {
		tlsConn.Close()
		return nil, fmt.Errorf("invalid Sec-WebSocket-Accept")
	}

	// Check if server negotiated permessage-deflate (we don't support it)
	extensions := resp.Header.Get("Sec-WebSocket-Extensions")
	if strings.Contains(extensions, "permessage-deflate") {
		log.Printf("[!] Warning: server negotiated permessage-deflate, messages may be compressed")
	}

	return &GameConn{conn: tlsConn, reader: reader}, nil
}

// ---------- Relay handler ----------

func handleRelay(w http.ResponseWriter, r *http.Request) {
	current := atomic.LoadInt64(&active)
	if current >= int64(*maxConnections) {
		http.Error(w, "Too many connections", http.StatusServiceUnavailable)
		return
	}

	target := r.URL.Query().Get("target")
	if target == "" {
		http.Error(w, "Missing ?target= parameter", http.StatusBadRequest)
		return
	}

	u, err := url.Parse(target)
	if err != nil || (!strings.HasSuffix(u.Hostname(), "sigmally.com") && u.Hostname() != "localhost") {
		http.Error(w, "Target not allowed", http.StatusForbidden)
		return
	}

	clientWS, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[!] Client upgrade failed: %v", err)
		return
	}

	n := atomic.AddInt64(&active, 1)
	clientIP := r.Header.Get("X-Forwarded-For")
	if clientIP == "" {
		clientIP = r.RemoteAddr
	}
	log.Printf("[+] %s -> %s (active: %d)", clientIP, target, n)

	gameWS, err := dialGameWS(target)
	if err != nil {
		log.Printf("[!] Game connect failed: %v", err)
		clientWS.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(1011, "Game server error"))
		clientWS.Close()
		atomic.AddInt64(&active, -1)
		return
	}

	log.Printf("[~] %s connected to game", clientIP)

	var once sync.Once
	cleanup := func(source string) {
		once.Do(func() {
			remaining := atomic.AddInt64(&active, -1)
			log.Printf("[-] %s (%s) (active: %d)", clientIP, source, remaining)
			clientWS.Close()
			gameWS.Close()
		})
	}

	// client → game
	go func() {
		defer cleanup("client-closed")
		for {
			mt, msg, err := clientWS.ReadMessage()
			if err != nil {
				return
			}
			if err := gameWS.WriteMessage(mt, msg); err != nil {
				return
			}
		}
	}()

	// game → client
	go func() {
		defer cleanup("game-closed")
		for {
			mt, msg, err := gameWS.ReadMessage()
			if err != nil {
				return
			}
			if err := clientWS.WriteMessage(mt, msg); err != nil {
				return
			}
		}
	}()
}

func main() {
	flag.Parse()

	if *proxyAddr != "" {
		log.Printf("Using SOCKS5 proxy: %s", *proxyAddr)
	}

	// Startup diagnostic: test connection to game server
	log.Println("[diag] Testing connection to eu0.sigmally.com...")
	gameConn, err := dialGameWS("wss://eu0.sigmally.com/ws/")
	if err != nil {
		log.Printf("[diag] ✘ Connection FAILED: %v", err)
		if *proxyAddr == "" {
			log.Println("[diag] Try with a SOCKS5 proxy: ./scout-relay -proxy socks5://user:pass@host:port")
		}
		log.Println("[diag] The relay will start anyway.")
	} else {
		log.Println("[diag] ✔ Connection SUCCESS! Game server accepted the WebSocket.")
		gameConn.Close()
	}

	http.HandleFunc("/relay", handleRelay)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Scout Relay (Go+utls)\nActive: %d\n", atomic.LoadInt64(&active))
	})
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if websocket.IsWebSocketUpgrade(r) {
			handleRelay(w, r)
			return
		}
		fmt.Fprintf(w, "Scout Relay (Go+utls)\nActive: %d\n", atomic.LoadInt64(&active))
	})

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("Scout Relay (Go+utls) listening on %s", addr)
	log.Printf("Max connections: %d", *maxConnections)
	log.Printf("URL: ws://localhost%s/relay?target=wss://eu0.sigmally.com/ws/", addr)

	srv := &http.Server{
		Addr:              addr,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}
