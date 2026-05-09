import express from 'express'
import session from 'express-session'
import fs from 'fs'
import path from 'path'
import net from 'net'
import { fileURLToPath } from 'url'
import type { Game } from '../domain/Game.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 5000
const PASSWORD = process.env.CONSOLE_PASSWORD || "admin"
const SOCKET_PATH = '/tmp/sigserver.sock'
const SETTINGS_FILE = path.join(__dirname, '../../settings.json')
const LOGS_DIR = path.join(__dirname, '../../logs')
const LOG_FILE = path.join(LOGS_DIR, 'latest.log')
const TEMPLATES_DIR = path.join(__dirname, '../../templates')

export class AdminServer {
    private app: express.Application
    private game: Game
    private server: any

    constructor(game: Game) {
        this.game = game
        this.app = express()
        this.setupMiddleware()
        this.setupRoutes()
    }

    private setupMiddleware(): void {
        this.app.use(express.json())
        this.app.use(express.urlencoded({ extended: true }))
        this.app.use(session({
            secret: 'sig-console-secret',
            resave: false,
            saveUninitialized: true,
        }))
    }

    private auth(req: any, res: any, next: any): void {
        if (req.session.authenticated) next()
        else res.status(401).send('No autorizado')
    }

    private sendCommand(cmd: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const client = net.createConnection({ path: SOCKET_PATH }, () => {
                client.write(cmd); client.end(); resolve()
            })
            client.on('error', (err) => reject(err))
        })
    }

    private setupRoutes(): void {
        this.app.use(express.static(path.join(__dirname, '../../public')))

        this.app.post('/api/login', (req, res) => {
            if (req.body.password === PASSWORD) {
                ;(req.session as any).authenticated = true
                res.json({ success: true })
            } else {
                res.status(401).json({ success: false, message: 'Contraseña incorrecta' })
            }
        })

        this.app.get('/api/settings', this.auth.bind(this), (_req, res) => {
            try { res.json(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))) }
            catch (e: any) { res.status(500).json({ error: e.message }) }
        })

        this.app.get('/api/templates', this.auth.bind(this), (_req, res) => {
            try {
                if (!fs.existsSync(TEMPLATES_DIR)) { res.json([]); return }
                const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'))
                const templates = files.map(f => {
                    const c = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf-8'))
                    return { id: f, name: c._template_name || f.replace('.json', ''), desc: c._template_desc || '' }
                })
                res.json(templates)
            } catch (e: any) { res.status(500).json({ error: e.message }) }
        })

        this.app.post('/api/templates/save', this.auth.bind(this), (req, res) => {
            try {
                const { id, name, desc, settings } = req.body
                if (!id) { res.status(400).send('ID requerido'); return }
                const fileName = id.endsWith('.json') ? id : `${id}.json`
                if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true })
                fs.writeFileSync(path.join(TEMPLATES_DIR, fileName), JSON.stringify({ ...settings, _template_name: name, _template_desc: desc }, null, 4))
                res.json({ success: true })
            } catch (e: any) { res.status(500).json({ error: e.message }) }
        })

        this.app.delete('/api/templates/:id', this.auth.bind(this), (req, res) => {
            try {
                const fp = path.join(TEMPLATES_DIR, req.params.id)
                if (fs.existsSync(fp)) { fs.unlinkSync(fp); res.json({ success: true }) }
                else res.status(404).send('No encontrado')
            } catch (e: any) { res.status(500).json({ error: e.message }) }
        })

        this.app.get('/api/templates/:id', this.auth.bind(this), (req, res) => {
            try {
                const fp = path.join(TEMPLATES_DIR, req.params.id)
                res.json(JSON.parse(fs.readFileSync(fp, 'utf-8')))
            } catch (e: any) { res.status(500).json({ error: e.message }) }
        })

        this.app.post('/api/settings', this.auth.bind(this), async (req, res) => {
            try {
                const newSettings = { ...req.body }
                delete newSettings._template_name; delete newSettings._template_desc
                let current = {}
                try { current = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) } catch { /* ignore */ }
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(Object.assign(current, newSettings), null, 4))
                await this.sendCommand('reload')
                res.json({ success: true })
            } catch (e: any) { res.status(500).json({ error: e.message }) }
        })

        this.app.post('/api/command', this.auth.bind(this), async (req, res) => {
            try {
                if (!req.body.command) { res.status(400).send('Comando requerido'); return }
                await this.sendCommand(req.body.command)
                res.json({ success: true })
            } catch (e: any) { res.status(500).json({ error: e.message }) }
        })

        this.app.get('/api/logs', this.auth.bind(this), (_req, res) => {
            try {
                if (!fs.existsSync(LOG_FILE)) { res.send(''); return }
                const lines = fs.readFileSync(LOG_FILE, 'utf-8').split('\n')
                const filtered: string[] = []
                for (let i = lines.length - 1; i >= 0 && filtered.length < 250; i--) {
                    if (!lines[i].includes('MAPDATA:')) filtered.unshift(lines[i])
                }
                res.send(filtered.join('\n'))
            } catch (e: any) { res.status(500).send('Error: ' + e.message) }
        })

        this.app.get('/api/status', this.auth.bind(this), (_req, res) => {
            res.json({ authenticated: true })
        })

        this.app.post('/api/players', this.auth.bind(this), (_req, res) => {
            try {
                const players = Object.values(this.game.players).map(p => ({
                    id: p.id,
                    world: p.world?.id ?? '-',
                    state: ['alive', 'spec', 'roam', 'idle'][Math.max(0, p.state + 1)] ?? '?',
                    name: p.leaderboardName || 'unnamed',
                }))
                res.json(players)
            } catch (e: any) { res.status(500).json({ error: e.message }) }
        })

        this.app.post('/api/map-data', this.auth.bind(this), (_req, res) => {
            try {
                const data: any = { worlds: [] }
                for (const wid in this.game.worlds) {
                    const w = this.game.worlds[wid]
                    const players: any[] = []
                    for (const p of w.players) {
                        if (p.state !== 0) continue
                        const cells = p.ownedCells.map(c => ({
                            id: c.id,
                            x: Math.round(c.x * 100) / 100,
                            y: Math.round(c.y * 100) / 100,
                            size: Math.round(c.size * 100) / 100,
                        }))
                        players.push({
                            id: p.id,
                            name: p.leaderboardName || p.cellName || 'Unnamed',
                            score: Math.round(p.score),
                            color: p.cellColor,
                            cells,
                        })
                    }
                    data.worlds.push({
                        id: parseInt(wid),
                        border: w.border,
                        playerCount: w.players.length,
                        stats: {
                            playing: w.stats.playing,
                            spectating: w.stats.spectating,
                            name: w.stats.name,
                            gamemode: w.stats.gamemode,
                            uptime: w.stats.uptime,
                        },
                        players,
                    })
                }
                res.json(data)
            } catch { res.json({ worlds: [] }) }
        })

        this.app.post('/api/map/mass', this.auth.bind(this), (req, res) => {
            try {
                const { playerId, mass } = req.body
                if (playerId == null || mass == null) { res.status(400).json({ error: 'Missing fields' }); return }
                const player = this.game.players[playerId]
                if (!player) { res.status(404).json({ error: 'Player not found' }); return }
                const cellCount = player.ownedCells.length
                if (cellCount === 0) { res.json({ success: true }); return }
                const totalSquareSize = mass * 100
                const currentTotal = player.ownedCells.reduce((sum, c) => sum + c.squareSize, 0)
                for (const cell of player.ownedCells) {
                    if (currentTotal <= 0) {
                        cell.squareSize = totalSquareSize / cellCount
                    } else {
                        cell.squareSize = cell.squareSize / currentTotal * totalSquareSize
                    }
                }
                res.json({ success: true })
            } catch (e: any) { res.status(500).json({ error: e.message }) }
        })

        this.app.post('/api/map/move', this.auth.bind(this), (req, res) => {
            try {
                const { playerId, cellId, x, y, all } = req.body
                if (playerId == null || x == null || y == null) { res.status(400).json({ error: 'Missing fields' }); return }
                const player = this.game.players[playerId]
                if (!player) { res.status(404).json({ error: 'Player not found' }); return }
                if (all) {
                    // Move all cells by the same delta as the dragged cell
                    const dragged = player.ownedCells.find(c => c.id === cellId)
                    if (dragged) {
                        const dx = x - dragged.x
                        const dy = y - dragged.y
                        for (const cell of player.ownedCells) {
                            cell.x += dx
                            cell.y += dy
                        }
                    }
                } else {
                    for (const cell of player.ownedCells) {
                        if (cell.id === cellId) {
                            cell.x = x
                            cell.y = y
                            break
                        }
                    }
                }
                res.json({ success: true })
            } catch (e: any) { res.status(500).json({ error: e.message }) }
        })

        this.app.get('/logout', (req, res) => {
            req.session.destroy(() => res.redirect('/'))
        })

        this.app.use((req, res) => {
            if (!(req.session as any).authenticated && req.path !== '/login.html') {
                return res.sendFile(path.join(__dirname, '../../public/login.html'))
            }
            res.sendFile(path.join(__dirname, '../../public/index.html'))
        })
    }

    start(): void {
        this.server = this.app.listen(PORT, () => {
            this.game.logger.info(`admin console on http://localhost:${PORT}`)
        })
    }

    stop(): void {
        if (this.server) this.server.close()
    }
}
