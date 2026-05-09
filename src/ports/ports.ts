import type { Rect, ViewArea, FFAEntry } from '../domain/types.js'
import type { Cell } from '../domain/Cell.js'

export interface IProtocol {
    sendChat(name: string, color: number, isServer: boolean, message: string): void
    sendOwnedCell(cellId: number): void
    sendWorldBounds(bounds: Rect): void
    sendWorldReset(): void
    sendLeaderboard(entries: FFAEntry[], self?: FFAEntry): void
    sendSpectatePosition(view: ViewArea): void
    sendVisibleCells(added: Cell[], updated: Cell[], eaten: Cell[], removed: Cell[]): void
    sendStats(stats: Record<string, unknown>): void
}

export interface ILogger {
    print(...msg: unknown[]): void
    debug(...msg: unknown[]): void
    info(...msg: unknown[]): void
    warn(...msg: unknown[]): void
    error(...msg: unknown[]): void
}
