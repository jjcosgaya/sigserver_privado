import type { Rect } from './types.js'

const bitRangeKey = Symbol()

interface BitRange {
    leftmost: number; rightmost: number; topmost: number; bottommost: number
}

interface Item { range: Rect; [bitRangeKey]?: BitRange }

function clampBits(n: number): number {
    return Math.max(0, Math.min(31, n))
}

function tileIndex(x: number, y: number): number {
    return y * 32 + x
}

function getBitRange(gridRect: Rect, itemRect: Rect): BitRange {
    return {
        leftmost: clampBits(Math.floor(((itemRect.x - itemRect.w) - (gridRect.x - gridRect.w)) / (gridRect.w * 2) * 32)),
        rightmost: clampBits(Math.ceil(((itemRect.x + itemRect.w) - (gridRect.x - gridRect.w)) / (gridRect.w * 2) * 32)),
        topmost: clampBits(Math.floor(((itemRect.y - itemRect.h) - (gridRect.y - gridRect.h)) / (gridRect.h * 2) * 32)),
        bottommost: clampBits(Math.ceil(((itemRect.y + itemRect.h) - (gridRect.y - gridRect.h)) / (gridRect.h * 2) * 32)),
    }
}

function intersects(a: Rect, b: Rect): boolean {
    return Math.abs(a.x - b.x) < a.w + b.w && Math.abs(a.y - b.y) < a.h + b.h
}

export class BitGrid<T extends Item> {
    private tiles: Set<T>[] = []
    private gridRect: Rect

    constructor(gridRect: Rect) {
        this.gridRect = gridRect
        for (let i = 0; i < 1024; i++) this.tiles.push(new Set())
    }

    insert(item: T): void {
        const br = getBitRange(this.gridRect, item.range)
        item[bitRangeKey] = br
        for (let x = br.leftmost; x <= br.rightmost; x++) {
            for (let y = br.topmost; y <= br.bottommost; y++) {
                this.tiles[tileIndex(x, y)].add(item)
            }
        }
    }

    update(item: T): void {
        const newBr = getBitRange(this.gridRect, item.range)
        const oldBr = item[bitRangeKey]!
        item[bitRangeKey] = newBr

        const minL = Math.min(newBr.leftmost, oldBr.leftmost)
        const maxR = Math.max(newBr.rightmost, oldBr.rightmost)
        const minT = Math.min(newBr.topmost, oldBr.topmost)
        const maxB = Math.max(newBr.bottommost, oldBr.bottommost)

        for (let x = minL; x <= maxR; x++) {
            const inNewX = newBr.leftmost <= x && x <= newBr.rightmost
            const inOldX = oldBr.leftmost <= x && x <= oldBr.rightmost
            for (let y = minT; y <= maxB; y++) {
                const inNew = inNewX && newBr.topmost <= y && y <= newBr.bottommost
                const inOld = inOldX && oldBr.topmost <= y && y <= oldBr.bottommost
                if (inNew && !inOld) this.tiles[tileIndex(x, y)].add(item)
                else if (!inNew && inOld) this.tiles[tileIndex(x, y)].delete(item)
            }
        }
    }

    remove(item: T): void {
        const br = item[bitRangeKey]
        if (!br) return
        for (let x = br.leftmost; x <= br.rightmost; x++) {
            for (let y = br.topmost; y <= br.bottommost; y++) {
                this.tiles[tileIndex(x, y)].delete(item)
            }
        }
        delete item[bitRangeKey]
    }

    search(range: Rect, callback: (item: T) => void, fast = false): void {
        const br = getBitRange(this.gridRect, range)
        for (let x = br.leftmost; x <= br.rightmost; x++) {
            for (let y = br.topmost; y <= br.bottommost; y++) {
                for (const item of this.tiles[tileIndex(x, y)]) {
                    const ibr = item[bitRangeKey]
                    if (!ibr) continue
                    if ((br.leftmost <= ibr.leftmost && ibr.leftmost < x) ||
                        (br.topmost <= ibr.topmost && ibr.topmost < y)) continue
                    if (fast || intersects(item.range, range)) callback(item)
                }
            }
        }
    }

    containsAny(range: Rect, selector?: (item: T) => boolean): boolean {
        const br = getBitRange(this.gridRect, range)
        for (let x = br.leftmost; x <= br.rightmost; x++) {
            for (let y = br.topmost; y <= br.bottommost; y++) {
                for (const item of this.tiles[tileIndex(x, y)]) {
                    const ibr = item[bitRangeKey]
                    if (!ibr) continue
                    if (intersects(item.range, range) && (!selector || selector(item))) return true
                }
            }
        }
        return false
    }
}
