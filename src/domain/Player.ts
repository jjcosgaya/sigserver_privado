import type { IProtocol } from '../ports/ports.js'
import type { Settings, ViewArea, PlayerState, SpawningAttrs } from './types.js'
import type { Cell } from './Cell.js'
import type { World } from './World.js'

let nextId = 1
export function resetPlayerIds() { nextId = 1 }

export class Player {
    id = nextId++
    exists = true
    state: PlayerState = -1
    hasWorld = false
    world: World | null = null
    score = NaN
    protocol: IProtocol | null = null

    ownedCells: Cell[] = []
    visibleCells: Record<number, Cell> = {}
    lastVisibleCells: Record<number, Cell> = {}
    visibleCellsTick = NaN

    leaderboardName: string | null = null
    cellName: string | null = null
    chatName = 'Spectator'
    cellSkin: string | null = null
    cellColor = 0x7F7F7F
    chatColor = 0x7F7F7F

    clan = ''
    showClanmates = false
    sub = false
    spawningAttrs: SpawningAttrs | null = null

    mouseX = 0; mouseY = 0
    splitAttempts = 0
    ejectAttempts = 0
    ejectCooldownTick = -999
    isPressingQ = false
    processedQ = false
    disconnected = false

    settings: Settings
    viewArea: ViewArea

    constructor(settings: Settings) {
        this.settings = settings
        this.viewArea = {
            x: 0, y: 0,
            w: 1920 / 2 * settings.playerViewScaleMult,
            h: 1080 / 2 * settings.playerViewScaleMult,
            s: 1,
        }
    }

    destroy(): void {
        if (this.hasWorld && this.world) this.world.removePlayer(this)
        this.exists = false
    }

    updateState(targetState: PlayerState): void {
        if (this.world === null) this.state = -1
        else if (this.ownedCells.length > 0) this.state = 0
        else if (targetState === -1) this.state = -1
        else if (this.world.largestPlayer === null) this.state = 2
        else if (this.state === 1 && targetState === 2) this.state = 2
        else this.state = 1
    }

    updateViewArea(): void {
        if (this.world === null) return
        const s = this.settings
        switch (this.state) {
            case -1:
                this.score = NaN
                break
            case 0: {
                let x = 0, y = 0, score = 0, size = 0
                const l = this.ownedCells.length
                for (let i = 0; i < l; i++) {
                    const cell = this.ownedCells[i]
                    x += cell.x; y += cell.y; size += cell.size; score += cell.mass
                }
                this.viewArea.x = x / l
                this.viewArea.y = y / l
                this.score = score
                const vs = this.viewArea.s = Math.pow(Math.min(64 / size, 1), 0.4)
                this.viewArea.w = 1920 / vs / 2 * s.playerViewScaleMult
                this.viewArea.h = 1080 / vs / 2 * s.playerViewScaleMult
                break
            }
            case 1:
                this.score = NaN
                const spectating = this.world.largestPlayer
                if (spectating) {
                    this.viewArea.x = spectating.viewArea.x
                    this.viewArea.y = spectating.viewArea.y
                    this.viewArea.s = spectating.viewArea.s
                    this.viewArea.w = spectating.viewArea.w
                    this.viewArea.h = spectating.viewArea.h
                }
                break
            case 2: {
                this.score = NaN
                const border = this.world.border
                this.viewArea.s = s.playerRoamViewScale
                this.viewArea.w = 1920 / this.viewArea.s / 2 * s.playerViewScaleMult
                this.viewArea.h = 1080 / this.viewArea.s / 2 * s.playerViewScaleMult
                break
            }
        }
    }

    updateVisibleCells(): void {
        if (!this.world) return
        const world = this.world

        this.lastVisibleCells = this.visibleCells
        const visible: Record<number, Cell> = {}
        this.visibleCells = visible
        this.visibleCellsTick = NaN

        if (this.state === 1 && world.largestPlayer && this !== world.largestPlayer) {
            world.largestPlayer.updateVisibleCells()
            this.visibleCells = world.largestPlayer.visibleCells
        } else {
            for (const cell of this.ownedCells) visible[cell.id] = cell

            if (this.clan && this.showClanmates) {
                for (const p of world.players) {
                    if (p !== this && p.clan === this.clan && p.ownedCells[0]) {
                        visible[p.ownedCells[0].id] = p.ownedCells[0]
                    }
                }
            }

            world.finder.search(this.viewArea, (cell) => { visible[cell.id] = cell })
        }
    }

    checkExistence(): void {
        if (!this.exists || !this.disconnected) return
        if (this.state !== 0) this.exists = false
    }
}
