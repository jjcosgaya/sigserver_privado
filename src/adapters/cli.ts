import * as readline from 'readline'
import * as fs from 'fs'
import * as net from 'net'
import type { Game } from '../domain/Game.js'

const SOCKET_PATH = '/tmp/sigserver.sock'

export class CLI {
    private game: Game
    private rl: readline.Interface
    private closing = false

    constructor(game: Game) {
        this.game = game
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
            prompt: '',
            historySize: 64,
            removeHistoryDuplicates: true,
        })

        this.rl.once('SIGINT', () => {
            this.game.logger.info('SIGINT received')
            this.closing = true
            this.rl.close()
            this.game.stop()
            process.exitCode = 0
            setTimeout(() => process.exit(0), 1000)
        })

        this.rl.on('close', () => { this.closing = true })

        this.setupBridge()
        if (process.stdin.isTTY) setTimeout(() => this.ask(), 1000)
        else this.game.logger.debug('non-TTY mode, CLI disabled')
    }

    private ask(): void {
        if (this.closing) return
        this.rl.question('@ ', (input) => {
            setTimeout(() => this.ask(), 0)
            if (!(input = input.trim())) return
            this.execute(input)
        })
    }

    execute(input: string): void {
        const parts = input.split(/\s+/)
        const cmd = parts[0].toLowerCase()
        const args = parts.slice(1)
        const g = this.game

        switch (cmd) {
            case 'help':
                this.log('Commands: help, players, stats, setting, reload, save, mass, kill, move, explode, addbot, rmbot, forbid, pardon, restart, start, stop, exit, mapdata')
                break
            case 'players':
                for (const id in g.players) {
                    const p = g.players[id]
                    this.log(`${p.id} | ${p.world?.id ?? '-'} ${stateLabel(p.state)} ${p.leaderboardName ?? 'unnamed'}`)
                }
                break
            case 'stats':
                this.log(`Worlds: ${Object.keys(g.worlds).length}, Players: ${Object.keys(g.players).length}, Bots: ${g.bots.length}`)
                for (const id in g.worlds) {
                    const w = g.worlds[id]
                    this.log(`  World ${id}: ${w.players.length} players, ${w.cells.size} cells, ${w.stats.external} external`)
                }
                break
            case 'setting': {
                if (args.length === 0) { this.log('Usage: setting <key> [value]'); break }
                if (args.length === 1) {
                    const val = (g.settings as any)[args[0]]
                    this.log(`${args[0]} = ${val !== undefined ? JSON.stringify(val) : 'not found'}`)
                } else {
                    const val = tryParse(args.slice(1).join(' '))
                    ;(g.settings as any)[args[0]] = val
                    g.setSettings(g.settings)
                    this.log(`set ${args[0]} = ${JSON.stringify(val)}`)
                }
                break
            }
            case 'reload': {
                try {
                    const data = JSON.parse(fs.readFileSync('./settings.json', 'utf-8'))
                    Object.assign(g.settings, data)
                    g.setSettings(g.settings)
                    this.log('settings reloaded')
                } catch (e: any) { this.log(`error: ${e.message}`) }
                break
            }
            case 'save': {
                try {
                    fs.writeFileSync('./settings.json', JSON.stringify(g.settings, null, 4))
                    this.log('settings saved')
                } catch (e: any) { this.log(`error: ${e.message}`) }
                break
            }
            case 'mass': {
                const id = parseInt(args[0]); const totalMass = parseInt(args[1])
                if (isNaN(id) || isNaN(totalMass)) { this.log('usage: mass <playerId> <totalMass>'); break }
                const p = g.players[id]
                if (!p) { this.log('player not found'); break }
                const cellCount = p.ownedCells.length
                if (cellCount === 0) { this.log('player has no cells'); break }
                // Distribute total mass proportionally to each cell
                const totalSquareSize = totalMass * 100
                const currentTotal = p.ownedCells.reduce((sum, c) => sum + c.squareSize, 0)
                if (currentTotal <= 0) {
                    for (const cell of p.ownedCells) {
                        cell.squareSize = totalSquareSize / cellCount
                    }
                } else {
                    for (const cell of p.ownedCells) {
                        cell.squareSize = cell.squareSize / currentTotal * totalSquareSize
                    }
                }
                this.log(`set mass for player ${id}`)
                break
            }
            case 'kill': {
                const id = parseInt(args[0])
                if (isNaN(id)) { this.log('usage: kill <playerId>'); break }
                g.removePlayer(id)
                break
            }
            case 'move': {
                const id = parseInt(args[0]); const x = parseFloat(args[1]); const y = parseFloat(args[2])
                if (isNaN(id) || isNaN(x) || isNaN(y)) { this.log('usage: move <playerId> <x> <y>'); break }
                const p = g.players[id]
                if (!p) { this.log('player not found'); break }
                p.mouseX = x; p.mouseY = y
                break
            }
            case 'explode': {
                const id = parseInt(args[0])
                if (isNaN(id)) { this.log('usage: explode <playerId>'); break }
                const p = g.players[id]
                if (!p?.world) { this.log('player not found or not in world'); break }
                for (const cell of [...p.ownedCells]) {
                    if (cell.type === 0) p.world.popCell(cell as any)
                }
                break
            }
            case 'addbot': g.addBot(); this.log(`bots: ${g.bots.length}`); break
            case 'rmbot': g.removeBot(); this.log(`bots: ${g.bots.length}`); break
            case 'forbid': {
                const ip = args[0]
                if (!ip) { this.log('usage: forbid <ip>'); break }
                ;(g.settings as any).listenerForbiddenIPs = [...(g.settings as any).listenerForbiddenIPs || [], ip]
                this.log(`forbidden ${ip}`)
                break
            }
            case 'pardon': {
                const ip = args[0]
                if (!ip) { this.log('usage: pardon <ip>'); break }
                const list: string[] = (g.settings as any).listenerForbiddenIPs || []
                const idx = list.indexOf(ip)
                if (idx >= 0) { list.splice(idx, 1); this.log(`pardoned ${ip}`) }
                else this.log('ip not found in forbid list')
                break
            }
            case 'restart':
                this.log('restarting...')
                g.stop()
                setTimeout(() => g.start(), 1000)
                break
            case 'start':
                if (g.start()) this.log('started')
                else this.log('already running')
                break
            case 'stop':
                if (g.stop()) this.log('stopped')
                else this.log('not running')
                break
            case 'exit':
                g.stop()
                this.closing = true
                this.rl.close()
                break
            case 'mapdata': {
                const worlds: any[] = []
                for (const id in g.worlds) {
                    const w = g.worlds[id]
                    const cells: any[] = []
                    for (const c of w.cells) {
                        cells.push({ id: c.id, x: c.x, y: c.y, s: c.size, t: c.type, n: c.name, sk: c.skin, c: c.color })
                    }
                    worlds.push({ id: w.id, cells, players: w.players.map(p => ({ id: p.id, name: p.leaderboardName, score: p.score, cells: p.ownedCells.map(c => c.id) })) })
                }
                this.log(`MAPDATA:${JSON.stringify({ worlds })}`)
                break
            }
            default:
                this.log('unknown command. type "help"')
        }
    }

    private log(msg: string): void {
        this.game.logger.info(msg)
    }

    private setupBridge(): void {
        if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH)
        const bridge = net.createServer((socket) => {
            socket.on('data', (data) => {
                const cmd = data.toString().trim()
                if (cmd === 'restart') {
                    this.game.stop()
                    setTimeout(() => this.game.start(), 1000)
                } else {
                    this.execute(cmd)
                }
            })
            socket.on('error', () => { /* ignore */ })
        })
        bridge.on('error', (err: Error) => {
            this.game.logger.error('bridge error:', err.message)
            setTimeout(() => this.setupBridge(), 5000)
        })
        bridge.listen(SOCKET_PATH, () => this.game.logger.debug(`bridge active on ${SOCKET_PATH}`))
        process.on('exit', () => { try { if (fs.existsSync(SOCKET_PATH)) fs.unlinkSync(SOCKET_PATH) } catch { /* ignore */ } })
    }
}

function stateLabel(s: number): string {
    return ['alive', 'spec', 'roam', 'idle'][s] ?? '?'
}

function tryParse(s: string): any {
    try { return JSON.parse(s) } catch { return s }
}
