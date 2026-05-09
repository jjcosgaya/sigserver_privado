import type { Rect, Boost } from './types.js'
import type { Player } from './Player.js'
import type { World } from './World.js'

let randSeed = Math.floor(Math.random() * 0xFFFFFF)
function randomColor(): number {
    randSeed = (randSeed * 9301 + 49297) % 0xFFFFFF
    return randSeed
}

let nextId = 1
export function resetCellIds() { nextId = 1 }

export class Cell {
    world: World
    id = nextId++
    birthTick = 0
    exists = false
    eatenBy: Cell | null = null
    range: Rect = { x: 0, y: 0, w: 0, h: 0 }
    isBoosting = false
    boost: Boost = { dx: 0, dy: 0, d: 0 }
    owner: Player | null = null

    private _x = 0; private _y = 0
    private _size = 0; private _color = 0
    private _name = ''; private _skin = ''

    posChanged = false; sizeChanged = false
    colorChanged = false; nameChanged = false; skinChanged = false

    constructor(world: World, x: number, y: number, size: number, color: number) {
        this.world = world
        this.birthTick = world.game.tick
        this._x = x; this._y = y; this._size = size; this._color = color
    }

    get age(): number { return (this.world.game.tick - this.birthTick) * this.world.game.stepMult }
    get type(): number { throw new Error('abstract') }
    get isSpiked(): boolean { throw new Error('abstract') }
    get isAgitated(): boolean { throw new Error('abstract') }
    get avoidWhenSpawning(): boolean { throw new Error('abstract') }
    get shouldUpdate(): boolean {
        return this.posChanged || this.sizeChanged ||
            this.colorChanged || this.nameChanged || this.skinChanged
    }

    get x(): number { return this._x }
    set x(v: number) { this._x = v; this.posChanged = true }
    get y(): number { return this._y }
    set y(v: number) { this._y = v; this.posChanged = true }
    get size(): number { return this._size }
    set size(v: number) { this._size = v; this.sizeChanged = true }
    get squareSize(): number { return this._size * this._size }
    set squareSize(v: number) { this.size = Math.sqrt(v) }
    get mass(): number { return this.squareSize / 100 }
    set mass(v: number) { this.squareSize = v * 100 }
    get color(): number { return this._color }
    set color(v: number) { this._color = v; this.colorChanged = true }
    get name(): string { return this._name }
    set name(v: string) { this._name = v; this.nameChanged = true }
    get skin(): string { return this._skin }
    set skin(v: string) { this._skin = v; this.skinChanged = true }

    get moveSpeed(): number {
        return Math.max(this._size / 2, 32) * 2
    }

    getEatResult(_other: Cell): number { throw new Error('abstract') }

    onSpawned(): void {}
    onTick(): void {
        this.posChanged = this.sizeChanged = this.colorChanged = this.nameChanged = this.skinChanged = false
    }

    whenAte(other: Cell): void {
        this.squareSize += other.squareSize
    }

    whenEatenBy(other: Cell): void {
        this.eatenBy = other
    }

    onRemoved(): void {}
}

export class PlayerCell extends Cell {
    _canMerge = false

    constructor(owner: Player, x: number, y: number, size: number) {
        super(owner.world!, x, y, size, owner.cellColor)
        this.owner = owner
        this.name = owner.cellName || ''
        this.skin = owner.cellSkin || ''
    }

    get type(): number { return 0 }
    get isSpiked(): boolean { return false }
    get isAgitated(): boolean { return false }
    get avoidWhenSpawning(): boolean { return true }
    get moveSpeed(): number {
        return 88 * Math.pow(this.size, -0.4396754) * this.owner!.settings.playerMoveMult
    }

    getEatResult(other: Cell): number {
        if (other.type === 1) return 2
        if (other.type === 0) {
            const delay = this.world.settings.playerNoCollideDelay
            if (other.owner!.id === this.owner!.id) {
                if (other.age < delay || this.age < delay) return 0
                if (this._canMerge && (other as PlayerCell)._canMerge) return 2
                return 1
            }
            return this.getDefaultEatResult(other)
        }
        if (other.type === 4 && other.size > this.size * this.world.settings.worldEatMult) return 3
        return this.getDefaultEatResult(other)
    }

    private getDefaultEatResult(other: Cell): number {
        return other.size * this.world.settings.worldEatMult > this.size ? 0 : 2
    }

    onTick(): void {
        super.onTick()
        if (this.name !== this.owner!.cellName) this.name = this.owner!.cellName || ''
        if (this.skin !== this.owner!.cellSkin) this.skin = this.owner!.cellSkin || ''
        if (this.color !== this.owner!.cellColor) this.color = this.owner!.cellColor

        const s = this.world.settings
        let delay = s.playerNoMergeDelay
        if (s.playerMergeTime > 0) {
            const initial = Math.round(25 * s.playerMergeTime)
            const increase = Math.round(25 * this.size * s.playerMergeTimeIncrease)
            delay = Math.max(delay, (s as any).playerMergeVersion === 'new' ? Math.max(initial, increase) : initial + increase)
        }
        this._canMerge = this.age >= delay
    }

    onSpawned(): void {
        this.owner!.ownedCells.push(this)
        this.world.playerCells.unshift(this)
    }

    onRemoved(): void {
        const idx = this.world.playerCells.indexOf(this)
        if (idx >= 0) this.world.playerCells.splice(idx, 1)
        const oi = this.owner!.ownedCells.indexOf(this)
        if (oi >= 0) this.owner!.ownedCells.splice(oi, 1)
        this.owner!.updateState(-1)
    }
}

export class Pellet extends Cell {
    private spawner: any
    private lastGrowTick: number

    constructor(world: World, spawner: any, x: number, y: number) {
        const size = world.settings.pelletMinSize
        super(world, x, y, size, randomColor())
        this.spawner = spawner
        this.lastGrowTick = this.birthTick
    }

    get type(): number { return 1 }
    get isSpiked(): boolean { return false }
    get isAgitated(): boolean { return false }
    get avoidWhenSpawning(): boolean { return false }
    get squareSize(): number { return this.size * this.size * (this.world.settings.pelletRewardMult || 1) }
    getEatResult(): number { return 0 }

    onTick(): void {
        super.onTick()
        if (this.size >= this.world.settings.pelletMaxSize) return
        const growTicks = this.world.settings.pelletGrowTicks
        if (growTicks <= 0) return
        if (this.world.game.tick - this.lastGrowTick > growTicks / this.world.game.stepMult) {
            this.lastGrowTick = this.world.game.tick
            this.mass = this.mass + 1
        }
    }

    onSpawned(): void { this.spawner.pelletCount++ }
    onRemoved(): void { this.spawner.pelletCount-- }
}

export class Virus extends Cell {
    fedTimes = 0
    splitAngle = 0

    constructor(world: World, x: number, y: number) {
        super(world, x, y, world.settings.virusSize, 0x33FF33)
    }

    get type(): number { return 2 }
    get isSpiked(): boolean { return true }
    get isAgitated(): boolean { return false }
    get avoidWhenSpawning(): boolean { return true }

    getEatResult(other: Cell): number {
        if (other.type === 4) return 3
        if (other.type === 3) return this.getEjectedEatResult(true)
        return 0
    }

    getEjectedEatResult(isSelf: boolean): number {
        return this.world.virusCount >= this.world.settings.virusMaxCount ? 0 : isSelf ? 2 : 3
    }

    onSpawned(): void { this.world.virusCount++ }

    whenAte(cell: Cell): void {
        const s = this.world.settings
        if (s.virusPushing) {
            const newD = this.boost.d + s.virusPushBoost
            this.boost.dx = (this.boost.dx * this.boost.d + cell.boost.dx * s.virusPushBoost) / newD
            this.boost.dy = (this.boost.dy * this.boost.d + cell.boost.dy * s.virusPushBoost) / newD
            this.boost.d = newD
            this.world.setCellAsBoosting(this)
        } else {
            this.splitAngle = Math.atan2(cell.boost.dx, cell.boost.dy)
            if (++this.fedTimes >= s.virusFeedTimes) {
                this.fedTimes = 0
                this.size = s.virusSize
                this.world.splitVirus(this)
            } else super.whenAte(cell)
        }
    }

    whenEatenBy(cell: Cell): void {
        super.whenEatenBy(cell)
        if (cell.type === 0) this.world.popCell(cell as PlayerCell)
    }

    onRemoved(): void { this.world.virusCount-- }
}

export class Mothercell extends Cell {
    pelletCount = 0
    private activeQueue = 0
    private passiveQueue = 0

    constructor(world: World, x: number, y: number) {
        super(world, x, y, world.settings.mothercellSize, 0xCE6363)
    }

    get type(): number { return 4 }
    get isSpiked(): boolean { return true }
    get isAgitated(): boolean { return false }
    get avoidWhenSpawning(): boolean { return true }
    getEatResult(): number { return 0 }

    onTick(): void {
        const s = this.world.settings
        const ms = s.mothercellSize
        const ps = s.pelletMinSize
        const minSpawnSq = ms * ms + ps * ps

        this.activeQueue += s.mothercellActiveSpawnSpeed * this.world.game.stepMult
        this.passiveQueue += Math.random() * s.mothercellPassiveSpawnChance * this.world.game.stepMult

        while (this.activeQueue > 0) {
            if (this.squareSize > minSpawnSq) { this.spawnPellet(); this.squareSize -= ps * ps }
            else if (this.size > ms) this.size = ms
            this.activeQueue--
        }
        while (this.passiveQueue > 0) {
            if (this.pelletCount < s.mothercellMaxPellets) this.spawnPellet()
            this.passiveQueue--
        }
    }

    private spawnPellet(): void {
        const angle = Math.random() * 2 * Math.PI
        const x = this.x + this.size * Math.sin(angle)
        const y = this.y + this.size * Math.cos(angle)
        const pellet = new Pellet(this.world, this, x, y)
        pellet.boost.dx = Math.sin(angle)
        pellet.boost.dy = Math.cos(angle)
        const d = this.world.settings.mothercellPelletBoost
        pellet.boost.d = d / 2 + Math.random() * d / 2
        this.world.addCell(pellet)
        this.world.setCellAsBoosting(pellet)
    }

    onSpawned(): void { this.world.mothercellCount++ }
    whenAte(cell: Cell): void {
        super.whenAte(cell)
        this.size = Math.min(this.size, this.world.settings.mothercellMaxSize)
    }
    whenEatenBy(cell: Cell): void {
        super.whenEatenBy(cell)
        if (cell.type === 0) this.world.popCell(cell as PlayerCell)
    }
    onRemoved(): void { this.world.mothercellCount-- }
}

export class EjectedCell extends Cell {
    constructor(world: World, owner: Player | null, x: number, y: number, color: number) {
        super(world, x, y, world.settings.ejectedSize, color)
        this.name = ' '
        this.owner = owner
    }

    get type(): number { return 3 }
    get isSpiked(): boolean { return false }
    get isAgitated(): boolean { return false }
    get avoidWhenSpawning(): boolean { return false }
    get squareSize(): number { return this.size * this.size * (this.world.settings.ejectedRewardMult || 1) }

    getEatResult(other: Cell): number {
        if (other.type === 4) return 3
        if (other.type === 3) {
            if (!other.isBoosting) other.world.setCellAsBoosting(other)
            return 1
        }
        return 0
    }

    onSpawned(): void { this.world.ejectedCells.push(this) }
    onRemoved(): void {
        const idx = this.world.ejectedCells.indexOf(this)
        if (idx >= 0) this.world.ejectedCells.splice(idx, 1)
    }
}
