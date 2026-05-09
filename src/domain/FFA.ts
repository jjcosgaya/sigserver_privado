import type { World } from './World.js'
import type { Player } from './Player.js'
import type { Cell } from './Cell.js'
import type { FFAEntry } from './types.js'

export class FFA {
    static onNewPlayer(player: Player): void {
        player.cellColor = Math.floor(Math.random() * 0xFFFFFF)
        player.chatColor = player.cellColor
    }

    static canEat(_a: Cell, _b: Cell): boolean {
        return true
    }

    static getDecayMult(): number {
        return 0.003
    }

    static compileLeaderboard(world: World): void {
        world.leaderboard = world.players
            .filter(p => !isNaN(p.score))
            .sort((a, b) => b.score - a.score)

        const top10 = world.leaderboard.slice(0, 10)
        for (const p of world.players) {
            if (!p.protocol || !p.hasWorld) continue
            const selfIdx = world.leaderboard.indexOf(p)
            const selfData = isNaN(p.score) ? undefined : {
                name: p.leaderboardName || '',
                id: p.id,
                score: p.score,
                highlighted: p === world.largestPlayer,
                sub: p.sub,
                position: selfIdx + 1,
            }
            const entries: FFAEntry[] = top10.map((v, i) => ({
                name: v.leaderboardName || '',
                id: v.id,
                score: v.score,
                highlighted: v === world.largestPlayer,
                sub: v.sub,
                position: i + 1,
            }))
            p.protocol.sendLeaderboard(entries, selfData)
        }
    }
}
