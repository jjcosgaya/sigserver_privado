import type { Game } from './Game.js'
import type { World } from './World.js'
import type { Cell, PlayerCell } from './Cell.js'
import { Player } from './Player.js'

export class Bot {
    player: Player
    private world: World
    private splitCooldown = 0
    private target: Cell | null = null

    constructor(game: Game, world: World) {
        this.world = world
        this.player = game.createPlayer(null)
        world.addPlayer(this.player)

        const names = world.settings.worldPlayerBotNames
        const skins = world.settings.worldPlayerBotSkins
        let name = names[~~(Math.random() * names.length)] || 'Player bot'
        let skin = ''
        if (name.includes('{*}')) {
            skin = skins[~~(Math.random() * skins.length)]
            name = name.replace('{*}', '')
        }
        this.player.spawningAttrs = { name, skin, spectating: false, clan: '', showClanmates: false, sub: false }
        this.player.cellColor = randomColor()
        this.player.chatColor = this.player.cellColor
    }

    get shouldClose(): boolean {
        return !this.player.exists || !this.player.hasWorld
    }

    update(): void {
        if (this.splitCooldown > 0) this.splitCooldown--
        else this.target = null

        this.player.updateVisibleCells()
        const p = this.player
        if (p.state === -1) {
            const names = this.world.settings.worldPlayerBotNames
            const skins = this.world.settings.worldPlayerBotSkins
            let name = names[~~(Math.random() * names.length)] || 'Player bot'
            let skin = ''
            if (name.includes('{*}')) {
                skin = skins[~~(Math.random() * skins.length)]
                name = name.replace('{*}', '')
            }
            p.spawningAttrs = { name, skin, spectating: false, clan: '', showClanmates: false, sub: false }
            return
        }

        let cell: PlayerCell | null = null
        for (const c of p.ownedCells) {
            if (!cell || (c as PlayerCell).size > cell.size) cell = c as PlayerCell
        }
        if (!cell) return

        if (this.target && this.target.exists && this.canEat(cell.size, this.target.size)) {
            p.mouseX = this.target.x
            p.mouseY = this.target.y
            return
        }
        this.target = null

        const atMaxCells = p.ownedCells.length >= this.world.settings.playerMaxCells
        const willingToSplit = p.ownedCells.length <= 2
        const cellCount = Object.keys(p.visibleCells).length

        let mx = 0, my = 0
        let bestPrey: Cell | null = null
        let splitkillObstacle = false

        for (const id in p.visibleCells) {
            const check = p.visibleCells[id]
            const truncatedInfluence = Math.log10(cell!.squareSize)
            let dx = check.x - cell!.x; let dy = check.y - cell!.y
            const dSplit = Math.max(1, Math.sqrt(dx * dx + dy * dy))
            const d = Math.max(1, dSplit - cell!.size - check.size)
            let influence = 0

            switch (check.type) {
                case 0: {
                    if (p.id === (check as PlayerCell).owner?.id) break
                    if (this.canEat(cell!.size, check.size)) {
                        influence = truncatedInfluence
                        if (bestPrey === null || check.size > bestPrey.size) bestPrey = check
                        if (!this.canSplitkill(cell!.size, check.size, dSplit)) break
                    } else {
                        influence = this.canEat(check.size, cell!.size) ? -truncatedInfluence * cellCount : -1
                        splitkillObstacle = true
                    }
                    break
                }
                case 1: influence = 1; break
                case 2:
                    if (atMaxCells) influence = truncatedInfluence
                    else if (this.canEat(cell!.size, check.size)) {
                        influence = -1 * cellCount
                        if (this.canSplitkill(cell!.size, check.size, dSplit)) splitkillObstacle = true
                    }
                    break
                case 3:
                    if (this.canEat(check.size, cell!.size)) influence = -1
                    else if (this.canEat(cell!.size, check.size)) {
                        influence = atMaxCells ? truncatedInfluence * cellCount : -1
                    }
                    break
                case 4:
                    if (this.canEat(cell!.size, check.size)) influence = truncatedInfluence * cellCount
                    break
            }

            if (influence === 0) continue
            const nd = d === 0 ? 1 : d
            mx += (dx / nd) * influence / nd
            my += (dy / nd) * influence / nd
        }

        if (willingToSplit && !splitkillObstacle && this.splitCooldown <= 0 &&
            bestPrey !== null && bestPrey.size * 2 > cell!.size) {
            this.target = bestPrey
            p.mouseX = bestPrey.x
            p.mouseY = bestPrey.y
            p.splitAttempts++
            this.splitCooldown = 25
        } else {
            const d = Math.max(1, Math.sqrt(mx * mx + my * my))
            p.mouseX = cell!.x + (mx / d) * p.viewArea.w
            p.mouseY = cell!.y + (my / d) * p.viewArea.h
        }
    }

    private canEat(aSize: number, bSize: number): boolean {
        return aSize > bSize * this.world.settings.worldEatMult
    }

    private canSplitkill(aSize: number, bSize: number, d: number): boolean {
        const s = this.world.settings
        const splitDist = Math.max(
            2 * aSize / s.playerSplitSizeDiv / 2,
            s.playerSplitBoost,
        )
        return aSize / s.playerSplitSizeDiv > bSize * s.worldEatMult &&
            d - splitDist <= aSize - bSize / s.worldEatOverlapDiv
    }
}

function randomColor(): number {
    return (Math.random() * 0xFFFFFF) | 0
}
