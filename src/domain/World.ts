import type { Settings, Rect, Point, SpawningAttrs, WorldStats } from './types.js'
import type { Game } from './Game.js'
import { Cell, PlayerCell, Pellet, Virus, Mothercell, EjectedCell } from './Cell.js'
import type { Player } from './Player.js'
import { BitGrid } from './BitGrid.js'

export class World {
    id: number
    cells = new Set<Cell>()
    players: Player[] = []
    boostingCells: Cell[] = []
    playerCells: PlayerCell[] = []
    ejectedCells: EjectedCell[] = []
    pelletCount = 0; virusCount = 0; mothercellCount = 0
    frozen = false
    leaderboard: Player[] = []

    border!: Rect
    finder!: BitGrid<Cell>
    largestPlayer: Player | null = null

    private nextCellId = 1
    private eat: Cell[] = []
    private rigid: Cell[] = []

    game: Game
    get settings(): Settings { return this.game.settings }

    stats: WorldStats = {
        limit: 0, internal: 0, external: 0,
        playing: 0, spectating: 0,
        name: null, gamemode: '', loadTime: 0, uptime: 0,
    }

    constructor(game: Game, id: number) {
        this.game = game
        this.id = id
        const s = game.settings
        this.setBorder({ x: s.worldMapX, y: s.worldMapY, w: s.worldMapW, h: s.worldMapH })
    }

    get nextCell(): number {
        return this.nextCellId >= 4294967296 ? (this.nextCellId = 1) : this.nextCellId++
    }

    setBorder(range: Rect): void {
        if (this.border && this.border.x === range.x && this.border.y === range.y
            && this.border.w === range.w && this.border.h === range.h) return
        this.border = { ...range }
        this.finder = new BitGrid<Cell>(this.border)
        for (const cell of this.cells) {
            this.finder.insert(cell)
            if (cell.type !== 0 && !fullyIntersects(this.border, cell.range)) this.removeCell(cell)
        }
        for (const p of this.players) p.protocol?.sendWorldBounds(this.border)
    }

    addCell(cell: Cell): void {
        cell.exists = true
        cell.range = { x: cell.x, y: cell.y, w: cell.size, h: cell.size }
        this.cells.add(cell)
        this.finder.insert(cell)
        cell.onSpawned()
        this.game.onCellCreated(cell)
    }

    removeCell(cell: Cell): void {
        this.game.onCellRemoved(cell)
        cell.onRemoved()
        this.finder.remove(cell)
        cell.range = { x: 0, y: 0, w: 0, h: 0 }
        this.setCellAsNotBoosting(cell)
        this.cells.delete(cell)
        cell.exists = false
    }

    updateCell(cell: Cell): void {
        cell.range.x = cell.x; cell.range.y = cell.y
        cell.range.w = cell.size; cell.range.h = cell.size
        this.finder.update(cell)
    }

    setCellAsBoosting(cell: Cell): void {
        if (cell.isBoosting) return
        cell.isBoosting = true
        this.boostingCells.push(cell)
    }

    setCellAsNotBoosting(cell: Cell): void {
        if (!cell.isBoosting) return
        cell.isBoosting = false
        const idx = this.boostingCells.indexOf(cell)
        if (idx >= 0) this.boostingCells.splice(idx, 1)
    }

    addPlayer(player: Player): void {
        this.players.push(player)
        player.world = this
        player.hasWorld = true
        this.game.onPlayerJoinWorld(player)
        player.protocol?.sendWorldBounds(this.border)
    }

    removePlayer(player: Player): void {
        const idx = this.players.indexOf(player)
        if (idx >= 0) this.players.splice(idx, 1)
        this.game.onPlayerLeaveWorld(player)
        player.world = null
        player.hasWorld = false
        while (player.ownedCells.length > 0) this.removeCell(player.ownedCells[0])
        player.protocol?.sendWorldReset()
    }

    getRandomPos(cellSize: number): Point {
        const b = this.border
        return {
            x: b.x - b.w + cellSize + Math.random() * (2 * b.w - cellSize),
            y: b.y - b.h + cellSize + Math.random() * (2 * b.h - cellSize),
        }
    }

    isSafeSpawnPos(range: Rect): boolean {
        return !this.finder.containsAny(range, (item) => item.avoidWhenSpawning)
    }

    getSafeSpawnPos(cellSize: number, player?: Player): Point {
        const s = this.settings
        if (s.worldMultiboxSpawnNear && player) {
            const mb = this.getMultiboxPos(player, cellSize)
            if (mb) return mb
        }
        let tries = s.worldSafeSpawnTries
        while (--tries >= 0) {
            const pos = this.getRandomPos(cellSize)
            if (this.isSafeSpawnPos({ x: pos.x, y: pos.y, w: cellSize, h: cellSize })) return pos
        }
        return this.getRandomPos(cellSize)
    }

    getMultiboxPos(player: Player, cellSize: number): Point | null {
        const candidates = this.players.filter(p =>
            p !== player && p.ownedCells.length > 0 && p.protocol !== null)
        if (candidates.length === 0) return null
        const s = this.settings
        let tries = s.worldSafeSpawnTries
        while (--tries >= 0) {
            const other = candidates[~~(Math.random() * candidates.length)]
            const cell = other.ownedCells[~~(Math.random() * other.ownedCells.length)]
            const angle = Math.random() * Math.PI * 2
            const dist = cell.size + cellSize + 60 + Math.random() * 10
            const pos = {
                x: Math.max(this.border.x - this.border.w + cellSize, Math.min(cell.x + Math.cos(angle) * dist, this.border.x + this.border.w - cellSize)),
                y: Math.max(this.border.y - this.border.h + cellSize, Math.min(cell.y + Math.sin(angle) * dist, this.border.y + this.border.h - cellSize)),
            }
            if (this.isSafeSpawnPos({ x: pos.x, y: pos.y, w: cellSize, h: cellSize })) return pos
        }
        return null
    }

    getPlayerSpawn(cellSize: number, player?: Player): { color: number; pos: Point } {
        const s = this.settings
        if (s.worldSafeSpawnFromEjectedChance > Math.random() && this.ejectedCells.length > 0) {
            let tries = s.worldSafeSpawnTries
            while (--tries >= 0) {
                const cell = this.ejectedCells[~~(Math.random() * this.ejectedCells.length)]
                if (this.isSafeSpawnPos({ x: cell.x, y: cell.y, w: cellSize, h: cellSize })) {
                    this.removeCell(cell)
                    return { color: cell.color, pos: { x: cell.x, y: cell.y } }
                }
            }
        }
        return { color: 0, pos: this.getSafeSpawnPos(cellSize, player) }
    }

    spawnPlayer(player: Player, pos: Point, size: number): void {
        const cell = new PlayerCell(player, pos.x, pos.y, size)
        this.addCell(cell)
        player.updateState(0)
        player.protocol?.sendOwnedCell(cell.id)
        player.mouseX = pos.x
        player.mouseY = pos.y
    }

    update(): void {
        if (this.frozen) return
        this.game.onWorldTick(this)
        // finder cleanup if needed
        const s = this.settings

        this.setBorder({ x: s.worldMapX, y: s.worldMapY, w: s.worldMapW, h: s.worldMapH })

        for (const cell of this.cells) cell.onTick()

        while (this.pelletCount < s.pelletCount) {
            const pos = this.getSafeSpawnPos(s.pelletMinSize)
            this.addCell(new Pellet(this, this, pos.x, pos.y))
        }
        while (this.virusCount < s.virusMinCount) {
            const pos = this.getSafeSpawnPos(s.virusSize)
            this.addCell(new Virus(this, pos.x, pos.y))
        }
        while (this.mothercellCount < s.mothercellCount) {
            const pos = this.getSafeSpawnPos(s.mothercellSize)
            this.addCell(new Mothercell(this, pos.x, pos.y))
        }

        // Boost boosting cells (viruses ejected after being fed)
        for (let i = 0; i < this.boostingCells.length;) {
            if (!this.boostCell(this.boostingCells[i])) {
                this.boostingCells.splice(i, 1)
            } else i++
        }

        // Check eat/rigid for boosting cells (viruses + mothercells)
        let eatL = 0; let rigidL = 0
        this.eat.length = 0; this.rigid.length = 0
        for (const cell of this.boostingCells) {
            if (cell.type !== 2 && cell.type !== 4) continue
            this.finder.search(cell.range, (other) => {
                if (cell.id === other.id) return
                const r = cell.getEatResult(other)
                if (r === 1) { this.rigid[rigidL++] = cell; this.rigid[rigidL++] = other }
                else if (r === 2) { this.eat[eatL++] = cell; this.eat[eatL++] = other }
                else if (r === 3) { this.eat[eatL++] = other; this.eat[eatL++] = cell }
            })
        }

        // Move, decay, autosplit player cells
        for (const cell of this.playerCells) {
            this.movePlayerCell(cell)
            this.decayPlayerCell(cell)
            this.autosplitPlayerCell(cell)
            this.bounceCell(cell)
            this.updateCell(cell)
        }

        // Check eat/rigid for player cells
        for (const cell of this.playerCells) {
            this.finder.search(cell.range, (other) => {
                if (cell.id === other.id) return
                const r = cell.getEatResult(other)
                if (r === 1) { this.rigid[rigidL++] = cell; this.rigid[rigidL++] = other }
                else if (r === 2) { this.eat[eatL++] = cell; this.eat[eatL++] = other }
                else if (r === 3) { this.eat[eatL++] = other; this.eat[eatL++] = cell }
            }, true)
        }

        // Resolve rigid bodies and eat events
        for (let i = 0; i < rigidL;) this.resolveRigid(this.rigid[i++], this.rigid[i++])
        for (let i = 0; i < eatL;) this.resolveEat(this.eat[i++], this.eat[i++])

        // Recalculate largest player
        this.largestPlayer = null
        for (const p of this.players) {
            if (!isNaN(p.score) && (!this.largestPlayer || p.score > this.largestPlayer.score))
                this.largestPlayer = p
        }

        // Process each player
        for (let i = 0; i < this.players.length; i++) {
            const p = this.players[i]
            p.checkExistence()
            if (!p.exists) { this.game.removePlayer(p.id); i--; continue }
            if (p.state === 1 && this.largestPlayer == null) p.updateState(2)

            for (let j = 0; j < s.playerSplitCap && p.splitAttempts > 0; j++) {
                this.splitPlayer(p)
                p.splitAttempts--
            }
            const nextEject = this.game.tick - s.playerEjectDelay
            if (p.ejectAttempts > 0 && nextEject >= p.ejectCooldownTick) {
                this.ejectFromPlayer(p)
                p.ejectAttempts = 0
                p.ejectCooldownTick = this.game.tick
            }
            if (p.isPressingQ && !p.processedQ) {
                this.ejectFromPlayer(p)
                p.processedQ = true
            } else if (!p.isPressingQ) {
                p.processedQ = false
            }
            if (p.spawningAttrs) {
                if (p.spawningAttrs.spectating) {
                    p.updateState(2)
                } else {
                    this.game.onPlayerSpawnRequest(p)
                }
                p.spawningAttrs = null
            }
            p.updateViewArea()
            this.sendPlayerUpdates(p)
        }

        this.compileStats()
        this.game.compileLeaderboard(this)

        if (this.stats.external <= 0 && Object.keys(this.game.worlds).length - 1 > s.worldMinCount)
            this.game.removeWorld(this.id)
    }

    private resolveRigid(a: Cell, b: Cell): void {
        let dx = b.x - a.x; let dy = b.y - a.y
        let d = Math.sqrt(dx * dx + dy * dy)
        const m = a.size + b.size - d
        if (m <= 0) return
        if (d === 0) { d = 1; dx = 1; dy = 0 } else { dx /= d; dy /= d }
        const M = a.squareSize + b.squareSize
        const aM = b.squareSize / M; const bM = a.squareSize / M
        a.x -= dx * m * aM; a.y -= dy * m * aM
        b.x += dx * m * bM; b.y += dy * m * bM
        this.bounceCell(a); this.bounceCell(b)
        this.updateCell(a); this.updateCell(b)
    }

    private resolveEat(a: Cell, b: Cell): void {
        if (!a.exists || !b.exists) return
        const dx = b.x - a.x; const dy = b.y - a.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d > a.size - b.size / this.settings.worldEatOverlapDiv) return
        if (!this.game.canEat(a, b)) return
        a.whenAte(b); b.whenEatenBy(a)
        this.removeCell(b); this.updateCell(a)
    }

    private boostCell(cell: Cell): boolean {
        const d = cell.boost.d / 9 * this.game.stepMult
        cell.x += cell.boost.dx * d; cell.y += cell.boost.dy * d
        this.bounceCell(cell, true)
        this.updateCell(cell)
        cell.boost.d -= d
        if (cell.boost.d >= 1) return true
        return false
    }

    private bounceCell(cell: Cell, bounce = false): void {
        const r = cell.size / 2; const b = this.border
        if (cell.x <= b.x - b.w + r) { cell.x = b.x - b.w + r; if (bounce) cell.boost.dx = -cell.boost.dx }
        if (cell.x >= b.x + b.w - r) { cell.x = b.x + b.w - r; if (bounce) cell.boost.dx = -cell.boost.dx }
        if (cell.y <= b.y - b.h + r) { cell.y = b.y - b.h + r; if (bounce) cell.boost.dy = -cell.boost.dy }
        if (cell.y >= b.y + b.h - r) { cell.y = b.y + b.h - r; if (bounce) cell.boost.dy = -cell.boost.dy }
    }

    private movePlayerCell(cell: PlayerCell): void {
        if (cell.owner?.protocol == null) return
        let dx = cell.owner.mouseX - cell.x; let dy = cell.owner.mouseY - cell.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 1) return
        dx /= d; dy /= d
        const m = Math.min(cell.moveSpeed, d) * this.game.stepMult
        cell.x += dx * m; cell.y += dy * m
    }

    private decayPlayerCell(cell: PlayerCell): void {
        const newSize = cell.size - cell.size * this.game.getDecayMult(cell) / 50 * this.game.stepMult
        cell.size = Math.max(newSize, this.settings.playerMinSize)
    }

    private autosplitPlayerCell(cell: PlayerCell): void {
        const s = this.settings
        const minSplit = s.playerMaxSize * s.playerMaxSize
        const cellsLeft = 1 + s.playerMaxCells - cell.owner!.ownedCells.length
        const overflow = Math.ceil(cell.squareSize / minSplit)
        if (overflow === 1 || cellsLeft <= 0) return
        const splitTimes = Math.min(overflow, cellsLeft)
        const splitSize = Math.min(Math.sqrt(cell.squareSize / splitTimes), s.playerMaxSize)
        for (let i = 1; i < splitTimes; i++) {
            const angle = Math.random() * 2 * Math.PI
            this.launchCell(cell, splitSize, { dx: Math.sin(angle), dy: Math.cos(angle), d: s.playerSplitBoost })
        }
        cell.size = splitSize
    }

    launchCell(parent: Cell, size: number, boost: { dx: number; dy: number; d: number }): void {
        const owner = parent.owner!
        parent.squareSize -= size * size
        const x = parent.x + this.settings.playerSplitDistance * boost.dx
        const y = parent.y + this.settings.playerSplitDistance * boost.dy
        const newCell = new PlayerCell(owner as any, x, y, size)
        newCell.boost.dx = boost.dx; newCell.boost.dy = boost.dy; newCell.boost.d = boost.d
        this.addCell(newCell)
        this.setCellAsBoosting(newCell)
    }

    splitPlayer(player: Player): void {
        const s = this.settings
        for (const cell of [...player.ownedCells]) {
            if (player.ownedCells.length >= s.playerMaxCells) break
            if (cell.size < s.playerMinSplitSize) continue
            let dx = player.mouseX - cell.x; let dy = player.mouseY - cell.y
            let d = Math.sqrt(dx * dx + dy * dy)
            if (d < 1) { dx = 1; dy = 0; d = 1 } else { dx /= d; dy /= d }
            this.launchCell(cell, cell.size / s.playerSplitSizeDiv, { dx, dy, d: s.playerSplitBoost })
        }
    }

    ejectFromPlayer(player: Player): void {
        const s = this.settings; const loss = s.ejectingLoss * s.ejectingLoss
        for (const cell of player.ownedCells) {
            if (cell.size < s.playerMinEjectSize) continue
            let dx = player.mouseX - cell.x; let dy = player.mouseY - cell.y
            let d = Math.sqrt(dx * dx + dy * dy)
            if (d < 1) { dx = 1; dy = 0; d = 1 } else { dx /= d; dy /= d }
            const sx = cell.x + dx * cell.size; const sy = cell.y + dy * cell.size
            const newCell = new EjectedCell(this, player, sx, sy, cell.color)
            const a = Math.atan2(dx, dy) - s.ejectDispersion + Math.random() * 2 * s.ejectDispersion
            newCell.boost.dx = Math.sin(a); newCell.boost.dy = Math.cos(a); newCell.boost.d = s.ejectedCellBoost
            this.addCell(newCell); this.setCellAsBoosting(newCell)
            cell.squareSize -= loss * (s.ejectedRewardMult || 1)
            this.updateCell(cell)
        }
    }

    splitVirus(virus: Virus): void {
        const newVirus = new Virus(this, virus.x, virus.y)
        newVirus.boost.dx = Math.sin(virus.splitAngle)
        newVirus.boost.dy = Math.cos(virus.splitAngle)
        newVirus.boost.d = this.settings.virusSplitBoost
        this.addCell(newVirus)
        this.setCellAsBoosting(newVirus)
    }

    popCell(cell: PlayerCell): void {
        const splits = this.distributeMass(cell)
        const s = this.settings
        for (const mass of splits) {
            const angle = Math.random() * 2 * Math.PI
            this.launchCell(cell, Math.sqrt(mass * 100), { dx: Math.sin(angle), dy: Math.cos(angle), d: s.playerSplitBoost })
        }
    }

    private distributeMass(cell: PlayerCell): number[] {
        let cellsLeft = this.settings.playerMaxCells - cell.owner!.ownedCells.length
        if (cellsLeft <= 0) return []
        let splitMin = this.settings.playerMinSplitSize
        splitMin = splitMin * splitMin / 100
        const cellMass = cell.mass
        const s = this.settings
        if (s.virusMonotonePops) {
            const amount = Math.min(Math.floor(cellMass / splitMin), cellsLeft)
            return new Array(amount).fill(cellMass / (amount + 1))
        }
        if (cellMass / cellsLeft < splitMin) {
            let amount = 2; let perPiece: number
            while ((perPiece = cellMass / (amount + 1)) >= splitMin && amount * 2 <= cellsLeft) amount *= 2
            return new Array(amount).fill(perPiece!)
        }
        const result: number[] = []
        let nextMass = cellMass / 2; let massLeft = cellMass / 2
        while (cellsLeft > 0) {
            if (nextMass / cellsLeft < splitMin) break
            while (nextMass >= massLeft && cellsLeft > 1) nextMass /= 2
            result.push(nextMass); massLeft -= nextMass; cellsLeft--
        }
        nextMass = massLeft / cellsLeft
        return result.concat(new Array(cellsLeft).fill(nextMass))
    }

    private sendPlayerUpdates(player: Player): void {
        const proto = player.protocol
        if (!proto) return

        if (!player.hasWorld) return
        player.updateVisibleCells()

        const add: Cell[] = [], upd: Cell[] = [], eat: Cell[] = [], del: Cell[] = []
        const visible = player.visibleCells, lastVisible = player.lastVisibleCells
        const eatenIds = new Set<number>()

        for (const id in visible) {
            const cell = visible[id]
            if (!(id in lastVisible)) add.push(cell)
            else if (cell.shouldUpdate) upd.push(cell)
        }
        for (const id in lastVisible) {
            const cell = lastVisible[id]
            if (id in visible) continue
            if (cell.eatenBy !== null) {
                eat.push(cell)
                eatenIds.add(cell.id)
            }
        }

        // Safety net: add eat events from world collision list that player didn't see disappear
        for (let i = 0; i < this.eat.length; i += 2) {
            const eatenCell = this.eat[i + 1]
            if (!eatenIds.has(eatenCell.id) && eatenCell.eatenBy) {
                eat.push(eatenCell)
                eatenIds.add(eatenCell.id)
            }
        }

        for (const id in lastVisible) {
            const cell = lastVisible[id]
            if (id in visible || eatenIds.has(cell.id)) continue
            del.push(cell)
        }

        if (add.length > 0 || upd.length > 0 || eat.length > 0 || del.length > 0) {
            proto.sendVisibleCells(add, upd, eat, del)
        }

        if (player.state === 1 || player.state === 2) {
            proto.sendSpectatePosition(player.viewArea)
        }
    }

    private compileStats(): void {
        let external = 0, playing = 0, spectating = 0
        for (const p of this.players) {
            if (!p.exists || p.protocol == null) continue
            external++
            if (p.state === 0) playing++
            else if (p.state === 1 || p.state === 2) spectating++
        }
        this.stats.limit = this.settings.listenerMaxConnections - this.game.clientCount + external
        this.stats.internal = 0
        this.stats.external = external
        this.stats.playing = playing
        this.stats.spectating = spectating
        this.stats.name = this.settings.serverName
        this.stats.gamemode = 'FFA'
        this.stats.loadTime = this.game.averageLoadTime / this.game.stepMult
        this.stats.uptime = Math.floor((Date.now() - this.game.startTime.getTime()) / 1000)
    }
}

function fullyIntersects(b: Rect, r: Rect): boolean {
    return Math.abs(r.x - b.x) + r.w <= b.w && Math.abs(r.y - b.y) + r.h <= b.h
}
