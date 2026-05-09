import { WebSocketServer as WSS } from 'ws'
import type { Game } from '../domain/Game.js'
import type { Settings } from '../domain/types.js'
import { SigmallyProtocol } from './sigmally.js'

interface ClientInfo {
    ws: any
    protocol: SigmallyProtocol
    ip: string
    connectTime: number
}

export class SocketServer {
    private wss!: WSS
    private game: Game
    private clients = new Map<any, ClientInfo>()
    private ips = new Map<string, number>()

    constructor(game: Game) {
        this.game = game
    }

    open(): void {
        const s = this.game.settings
        this.wss = new WSS({ port: s.listeningPort })
        this.wss.on('connection', (ws: any, req: any) => this.onConnect(ws, req))
        this.wss.on('error', (err: Error) => this.game.logger.error('WebSocket error:', err.message))
    }

    close(): void {
        for (const { ws } of this.clients.values()) {
            try { ws.close() } catch { /* ignore */ }
        }
        this.clients.clear()
        this.ips.clear()
        this.wss.close()
    }

    private onConnect(ws: any, req: any): void {
        const ip = this.getClientIP(req)
        const s = this.game.settings

        if (!this.checkOrigin(req, s)) {
            ws.close(4001, 'Origin not allowed')
            return
        }

        if (this.clients.size >= s.listenerMaxConnections) {
            ws.close(4001, 'Server full')
            return
        }

        const ipCount = this.ips.get(ip) || 0
        if (ipCount >= s.listenerMaxConnectionsPerIP) {
            ws.close(4001, 'IP limit reached')
            return
        }

        if (s.listenerForbiddenIPs.includes(ip)) {
            ws.close(4001, 'IP forbidden')
            return
        }

        this.ips.set(ip, ipCount + 1)

        const protocol = new SigmallyProtocol(this.game, ws)
        const info: ClientInfo = { ws, protocol, ip, connectTime: Date.now() }
        this.clients.set(ws, info)
        this.game.clientCount = this.clients.size

        ws.on('message', (data: Buffer) => protocol.onMessage(data))
        ws.on('close', () => this.onClose(ws, ip))
        ws.on('error', () => this.onClose(ws, ip))
    }

    private onClose(ws: any, ip: string): void {
        const info = this.clients.get(ws)
        if (info) {
            info.protocol.onClose()
            this.clients.delete(ws)
            this.game.clientCount = this.clients.size
            const count = (this.ips.get(ip) || 1) - 1
            if (count <= 0) this.ips.delete(ip)
            else this.ips.set(ip, count)
        }
    }

    private getClientIP(req: any): string {
        const cf = req.headers['cf-connecting-ip']
        if (cf) return cf
        const xf = req.headers['x-forwarded-for']
        if (xf) return (Array.isArray(xf) ? xf[0] : xf.split(',')[0]).trim()
        const xr = req.headers['x-real-ip']
        if (xr) return xr
        return req.socket?.remoteAddress?.replace(/^::ffff:/, '') || '127.0.0.1'
    }

    private checkOrigin(req: any, s: Settings): boolean {
        if (s.listenerAcceptedOrigins.length === 0) return true
        const origin = req.headers['origin']
        if (!origin) return false
        return s.listenerAcceptedOrigins.includes(origin)
    }

    getClientCount(): number { return this.clients.size }
}
