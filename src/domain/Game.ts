import type { Settings } from './types.js'
import type { IProtocol, ILogger } from '../ports/ports.js'
import type { Cell, PlayerCell } from './Cell.js'
import { Player } from './Player.js'
import { World } from './World.js'
import { Bot } from './Bot.js'
import { FFA } from './FFA.js'
import { resetCellIds } from './Cell.js'
import { resetPlayerIds } from './Player.js'

export class Game {
    settings: Settings
    worlds: Record<number, World> = {}
    players: Record<number, Player> = {}
    bots: Bot[] = []
    tick = 0
    running = false
    startTime!: Date
    stepMult = 1
    averageLoadTime = 0

    logger: ILogger
    clientCount = 0
    private tickTimer: ReturnType<typeof setInterval> | null = null

    constructor(settings: Settings, logger: ILogger) {
        this.settings = settings
        this.logger = logger
    }

    setSettings(settings: Settings): void {
        this.settings = settings
        this.stepMult = (1000 / settings.serverFrequency) / 40
    }

    start(): boolean {
        if (this.running) return false
        this.running = true
        this.startTime = new Date()
        this.tick = 0
        resetCellIds()
        resetPlayerIds()
        this.ensureWorlds()
        const delay = 1000 / this.settings.serverFrequency
        this.tickTimer = setInterval(() => this.onTick(), delay)
        this.logger.info('server started')
        return true
    }

    stop(): boolean {
        if (!this.running) return false
        if (this.tickTimer) clearInterval(this.tickTimer)
        this.running = false
        this.logger.info('server stopped')
        return true
    }

    createPlayer(protocol: IProtocol | null): Player {
        const player = new Player(this.settings)
        player.protocol = protocol
        this.players[player.id] = player
        return player
    }

    removePlayer(id: number): void {
        const player = this.players[id]
        if (!player) return
        player.protocol?.sendWorldReset()
        player.protocol = null
        if (player.hasWorld && player.world) player.world.removePlayer(player)
        player.destroy()
        delete this.players[id]
    }

    assignPlayerToWorld(player: Player): void {
        if (player.hasWorld) return
        this.ensureWorlds()
        let best: World | null = null
        for (const id in this.worlds) {
            const w = this.worlds[id]
            if (!best || w.players.length < best.players.length) best = w
        }
        if (best) {
            best.addPlayer(player)
            player.protocol?.sendWorldBounds(best.border)
        }
    }

    addBot(): void {
        const keys = Object.keys(this.worlds)
        if (keys.length === 0) return
        const world = this.worlds[Number(keys[0])]
        if (!world) return
        const bot = new Bot(this, world)
        this.bots.push(bot)
    }

    removeBot(): void {
        const bot = this.bots.pop()
        if (bot) this.removePlayer(bot.player.id)
    }

    createWorld(): World {
        let id = 0
        while (Object.hasOwn(this.worlds, id)) id++
        const world = new World(this, id)
        this.worlds[id] = world
        this.logger.debug(`created world ${id}`)

        const botCount = this.settings.worldPlayerBotsPerWorld
        for (let i = 0; i < botCount; i++) this.addBot()

        return world
    }

    removeWorld(id: number): void {
        const world = this.worlds[id]
        if (!world) return
        for (const p of [...world.players]) {
            p.protocol?.sendWorldReset()
            this.removePlayer(p.id)
        }
        for (const bot of this.bots) {
            if (bot.player.world?.id === id) this.removePlayer(bot.player.id)
        }
        this.bots = this.bots.filter(b => b.player.world?.id !== id)
        delete this.worlds[id]
        this.logger.debug(`removed world ${id}`)
    }

    // Callbacks called by World

    onCellCreated(_cell: Cell): void {}
    onCellRemoved(_cell: Cell): void {}

    onWorldTick(_world: World): void {}

    onPlayerJoinWorld(player: Player): void {
        FFA.onNewPlayer(player)
    }

    onPlayerLeaveWorld(_player: Player): void {}

    onPlayerSpawnRequest(player: Player): void {
        if (player.state === 0 || !player.hasWorld || !player.world) return
        const world = player.world
        const size = this.settings.playerSpawnSize
        const spawnInfo = world.getPlayerSpawn(size, player)
        const color = spawnInfo.color || Math.floor(Math.random() * 0xFFFFFF)
        const attrs = player.spawningAttrs!
        let name = attrs.name || player.leaderboardName || ''
        let skin = attrs.skin || ''
        if (this.settings.playerAllowSkinInName) {
            const match = /^\{(.*)\}(.*)$/.exec(name)
            if (match) { name = match[2]; skin = match[1] }
        }
        name = name.substring(0, this.settings.playerMaxNameLength)
        player.cellName = player.chatName = player.leaderboardName = name
        player.cellSkin = skin
        player.chatColor = player.cellColor = color
        player.clan = attrs.clan || ''
        player.sub = !!attrs.sub
        world.spawnPlayer(player, spawnInfo.pos, size)
    }

    canEat(_a: Cell, _b: Cell): boolean {
        return FFA.canEat(_a, _b)
    }

    getDecayMult(_cell: PlayerCell): number {
        return FFA.getDecayMult()
    }

    compileLeaderboard(world: World): void {
        FFA.compileLeaderboard(world)
    }

    getPlayerCount(): number {
        return Object.keys(this.players).length
    }

    private onTick(): void {
        const start = performance.now()
        this.tick++

        this.ensureWorlds()

        for (let i = this.bots.length - 1; i >= 0; i--) {
            const bot = this.bots[i]
            if (bot.shouldClose) {
                this.removePlayer(bot.player.id)
                this.bots.splice(i, 1)
            } else {
                bot.update()
            }
        }

        for (const id in this.worlds) this.worlds[id].update()

        this.averageLoadTime = performance.now() - start
    }

    ensureWorlds(): void {
        if (Object.keys(this.worlds).length < 1) this.createWorld()
    }
}
