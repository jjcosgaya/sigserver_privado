import type { Cell } from '../domain/Cell.js'
import type { Player } from '../domain/Player.js'
import type { Game } from '../domain/Game.js'
import type { IProtocol } from '../ports/ports.js'
import type { Rect, SpawningAttrs, FFAEntry, ViewArea } from '../domain/types.js'

// ----- Binary Reader -----

class Reader {
    buf: Buffer
    private pos = 0
    get length() { return this.buf.length - this.pos }
    peekUInt8(): number { return this.buf[this.pos] }

    constructor(buf: Buffer) { this.buf = buf }

    readUInt8(): number { return this.buf.readUInt8(this.pos++) }
    readInt16(): number { const v = this.buf.readInt16LE(this.pos); this.pos += 2; return v }
    readInt32(): number { const v = this.buf.readInt32LE(this.pos); this.pos += 4; return v }
    readUInt16(): number { const v = this.buf.readUInt16LE(this.pos); this.pos += 2; return v }
    readUInt32(): number { const v = this.buf.readUInt32LE(this.pos); this.pos += 4; return v }
    readFloat64(): number { const v = this.buf.readDoubleLE(this.pos); this.pos += 8; return v }
    skip(n: number): void { this.pos += n }

    readZTStringUTF8(): string {
        const end = this.buf.indexOf(0, this.pos)
        if (end < 0) { const s = this.buf.toString('utf8', this.pos); this.pos = this.buf.length; return s }
        const s = this.buf.toString('utf8', this.pos, end)
        this.pos = end + 1
        return s
    }
}

// ----- Binary Writer -----

let pool: Buffer[] = []

class Writer {
    private buf: Buffer
    private pos = 0

    constructor(size = 16) {
        this.buf = pool.pop() || Buffer.allocUnsafe(size * 2)
        if (this.buf.length < size) this.buf = Buffer.allocUnsafe(size)
    }

    private ensure(n: number): void {
        if (this.pos + n <= this.buf.length) return
        const newBuf = Buffer.allocUnsafe(Math.max(this.buf.length * 2, this.pos + n))
        this.buf.copy(newBuf)
        pool.push(this.buf)
        this.buf = newBuf
    }

    writeUInt8(v: number): void { this.ensure(1); this.buf[this.pos++] = v & 0xFF }
    writeUInt16(v: number): void { this.ensure(2); this.buf.writeUInt16LE(v, this.pos); this.pos += 2 }
    writeUInt32(v: number): void { this.ensure(4); this.buf.writeUInt32LE(v, this.pos); this.pos += 4 }
    writeInt16(v: number): void { this.ensure(2); this.buf.writeInt16LE(v, this.pos); this.pos += 2 }
    writeInt32(v: number): void { this.ensure(4); this.buf.writeInt32LE(v, this.pos); this.pos += 4 }
    writeFloat32(v: number): void { this.ensure(4); this.buf.writeFloatLE(v, this.pos); this.pos += 4 }
    writeFloat64(v: number): void { this.ensure(8); this.buf.writeDoubleLE(v, this.pos); this.pos += 8 }

    writeColor(color: number): void {
        const r = (color >> 16) & 0xFF
        const g = (color >> 8) & 0xFF
        const b = color & 0xFF
        this.ensure(3)
        this.buf[this.pos++] = r
        this.buf[this.pos++] = g
        this.buf[this.pos++] = b
    }

    writeZTStringUTF8(s: string): void {
        const len = Buffer.byteLength(s, 'utf8')
        this.ensure(len + 1)
        this.buf.write(s, this.pos, len, 'utf8')
        this.pos += len
        this.buf[this.pos++] = 0
    }

    writeBytes(data: Buffer): void {
        this.ensure(data.length)
        data.copy(this.buf, this.pos)
        this.pos += data.length
    }

    writeBufferSize(): number { return this.pos }

    finalize(): Buffer {
        const out = Buffer.allocUnsafe(this.pos)
        this.buf.copy(out, 0, 0, this.pos)
        pool.push(this.buf)
        return out
    }
}

// ----- Sigmally Protocol -----

const shuffleTable = generateShuffle()
const shuffle = Buffer.from(shuffleTable)
const unshuffle = Buffer.alloc(256)
for (let i = 0; i < 256; i++) unshuffle[shuffle[i]] = i

function generateShuffle(): number[] {
    const arr: number[] = []
    for (let i = 0; i < 256; i++) arr.push(i)
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
}

export class SigmallyProtocol implements IProtocol {
    private game: Game
    private ws: any
    private player: Player | null = null
    private handshakeDone = false

    constructor(game: Game, ws: any) {
        this.game = game
        this.ws = ws
    }

    onMessage(data: Buffer): void {
        if (!this.handshakeDone) {
            this.handleHandshake(data)
            return
        }

        const reader = new Reader(data)
        const msgId = unshuffle[reader.readUInt8()]

        switch (msgId) {
            case 0: this.handleSpawnAttrs(reader); break
            case 16: this.handleMouseMove(reader); break
            case 17: this.handleSplit(); break
            case 18: this.handleQPress(true); break
            case 19: this.handleQPress(false); break
            case 21: this.handleEject(); break
            case 99: this.handleChat(reader); break
            case 0xBF: case 0xC0: case 0xD0: break
            case 254: this.handleStats(); break
        }
    }

    private handleHandshake(data: Buffer): void {
        const reader = new Reader(data)
        const sig = reader.readZTStringUTF8()
        if (sig !== 'SIG 0.0.1') { this.ws.close(); return }

        this.handshakeDone = true
        const writer = new Writer()
        writer.writeZTStringUTF8('SIG 0.0.1')
        writer.writeBytes(shuffle)
        this.send(writer.finalize())
    }

    private handleSpawnAttrs(reader: Reader): void {
        if (reader.length < 2) { this.ws.close(); return }
        try {
            const bodyStr = reader.readZTStringUTF8()
            const body = JSON.parse(bodyStr)
            if (typeof body.name !== 'string') { this.ws.close(); return }

            const spectating = body.state === 2
            if (!spectating && this.game.settings.serverPassword && this.game.settings.serverPassword !== body.password) {
                const w = new Writer(); w.writeUInt8(shuffle[0xb4]); this.send(w.finalize())
                return
            }

            const attrs: SpawningAttrs = {
                name: body.name,
                skin: body.skin ? body.skin.substring(0, 20) : '',
                spectating,
                clan: body.clan || '',
                showClanmates: !!body.showClanmates,
                sub: !!body.sub,
            }

            if (!this.player) {
                this.player = this.game.createPlayer(this)
                this.game.assignPlayerToWorld(this.player)
            } else if (!this.player.hasWorld) {
                this.game.assignPlayerToWorld(this.player)
            }

            this.player.spawningAttrs = attrs
        } catch { this.ws.close() }
    }

    private handleMouseMove(reader: Reader): void {
        if (!this.player || reader.length < 4) return
        const len = reader.length
        if (len >= 21) {
            this.player.mouseX = ~~reader.readFloat64()
            this.player.mouseY = ~~reader.readFloat64()
        } else if (len >= 8) {
            this.player.mouseX = reader.readInt32()
            this.player.mouseY = reader.readInt32()
        } else {
            this.player.mouseX = reader.readInt16()
            this.player.mouseY = reader.readInt16()
        }
    }

    private handleSplit(): void { if (this.player) this.player.splitAttempts++ }
    private handleEject(): void { if (this.player) this.player.ejectAttempts++ }
    private handleQPress(pressed: boolean): void { if (this.player) this.player.isPressingQ = pressed }

    private handleChat(reader: Reader): void {
        if (!this.player || reader.length < 2) return
        let msg: string
        // sigfixes client sends JSON chat: {"message":"..."}
        if (reader.peekUInt8() === 0x7B) {
            try {
                const body = JSON.parse(reader.readZTStringUTF8())
                if (typeof body.message !== 'string') return
                msg = body.message
            } catch { return }
        } else {
            // Original binary format: flags + skip + message
            const flags = reader.readUInt8()
            const skipLen = 2 * ((flags & 2) + (flags & 4) + (flags & 8))
            if (reader.length < skipLen) return
            reader.skip(skipLen)
            msg = reader.readZTStringUTF8()
        }
        if (msg.startsWith('/')) this.handleChatCommand(msg)
        else this.broadcastChat(this.player, msg)
    }

    private handleChatCommand(cmd: string): void {
        const parts = cmd.slice(1).split(/\s+/)
        const name = parts[0].toLowerCase()
        const args = parts.slice(1)

        if (!this.player) return
        const p = this.player

        switch (name) {
            case 'help':
                this.sendChat('Server', 0xFFFFFF, true, 'Available commands: /help, /id, /worldid, /stats')
                break
            case 'id':
                this.sendChat('Server', 0xFFFFFF, true, `Your ID: ${p.id}`)
                break
            case 'worldid':
                this.sendChat('Server', 0xFFFFFF, true, `World ID: ${p.world?.id ?? 'N/A'}`)
                break
            case 'stats':
                if (p.world) {
                    const s = p.world.stats
                    this.sendChat('Server', 0xFFFFFF, true,
                        `Players: ${s.external} | Playing: ${s.playing} | Spectating: ${s.spectating}`)
                }
                break
            case 'leaveworld':
                if (p.world) { p.world.removePlayer(p); this.game.assignPlayerToWorld(p) }
                break
        }
    }

    private broadcastChat(player: Player, message: string): void {
        if (!this.game.settings.chatEnabled) return
        if (!player.world) return
        for (const p of player.world.players) {
            p.protocol?.sendChat(player.cellName || player.chatName, player.chatColor, false, message)
        }
    }

    private handleStats(): void {
        if (!this.player?.world) return
        const stats = this.player.world.stats
        const writer = new Writer()
        writer.writeUInt8(shuffle[254])
        writer.writeZTStringUTF8(JSON.stringify({
            mode: stats.gamemode,
            update: stats.loadTime,
            playersTotal: stats.external,
            playersAlive: stats.playing,
            playersSpect: stats.spectating,
            playersLimit: stats.limit,
            name: stats.name,
            gamemode: stats.gamemode,
            loadTime: stats.loadTime,
            uptime: stats.uptime,
            internal: stats.internal,
            external: stats.external,
            playing: stats.playing,
            spectating: stats.spectating,
            limit: stats.limit,
        }))
        this.send(writer.finalize())
    }

    onClose(): void {
        if (this.player) this.game.removePlayer(this.player.id)
        this.player = null
    }

    // ---- IProtocol Implementation ----

    sendChat(name: string, color: number, isServer: boolean, message: string): void {
        const w = new Writer()
        w.writeUInt8(shuffle[99])
        w.writeUInt8(isServer ? 128 : 0)
        w.writeColor(color)
        w.writeZTStringUTF8(name)
        w.writeZTStringUTF8(message)
        this.send(w.finalize())
    }

    sendOwnedCell(cellId: number): void {
        const w = new Writer()
        w.writeUInt8(shuffle[32])
        w.writeUInt32(cellId)
        this.send(w.finalize())
    }

    sendWorldBounds(bounds: Rect): void {
        const w = new Writer()
        w.writeUInt8(shuffle[64])
        w.writeFloat64(bounds.x - bounds.w)
        w.writeFloat64(bounds.y - bounds.h)
        w.writeFloat64(bounds.x + bounds.w)
        w.writeFloat64(bounds.y + bounds.h)
        this.send(w.finalize())
    }

    sendWorldReset(): void {
        const w = new Writer()
        w.writeUInt8(shuffle[18])
        this.send(w.finalize())
    }

    sendLeaderboard(entries: FFAEntry[], self?: FFAEntry): void {
        const w = new Writer()
        if (entries.length > 0) {
            w.writeUInt8(shuffle[49])
            w.writeUInt32(entries.length)
            for (const e of entries) {
                w.writeUInt32(e.highlighted ? 1 : 0)
                w.writeZTStringUTF8(e.name)
                w.writeUInt32(self?.position ?? 0)
                w.writeUInt32(e.sub ? 1 : 0)
            }
        } else {
            w.writeUInt8(shuffle[48])
            w.writeUInt32(0)
        }
        this.send(w.finalize())
    }

    sendSpectatePosition(view: ViewArea): void {
        const w = new Writer()
        w.writeUInt8(shuffle[17])
        w.writeFloat32(view.x)
        w.writeFloat32(view.y)
        w.writeFloat32(view.s)
        this.send(w.finalize())
    }

    sendVisibleCells(added: Cell[], updated: Cell[], eaten: Cell[], removed: Cell[]): void {
        if (!this.player) return

        const w = new Writer()
        w.writeUInt8(shuffle[16])

        w.writeUInt16(eaten.length)
        for (const cell of eaten) {
            if (cell.eatenBy) {
                w.writeUInt32(cell.eatenBy.id)
                w.writeUInt32(cell.id)
            } else {
                w.writeUInt32(0)
                w.writeUInt32(cell.id)
            }
        }

        for (const cell of added) this.writeCellData(w, cell, this.player!, true)
        for (const cell of updated) this.writeCellData(w, cell, this.player!, false)

        w.writeUInt32(0)

        w.writeUInt16(removed.length)
        for (const cell of removed) w.writeUInt32(cell.id)

        this.send(w.finalize())
    }

    sendStats(_stats: Record<string, unknown>): void {
        // Handled via handleStats for request/response
    }

    private writeCellData(w: Writer, cell: Cell, source: Player, isNew: boolean): void {
        w.writeUInt32(cell.id)
        w.writeInt16(cell.x)
        w.writeInt16(cell.y)
        w.writeUInt16(cell.size)

        const needsColor = isNew || cell.colorChanged
        const needsSkin = isNew || cell.skinChanged
        const needsName = isNew || cell.nameChanged

        let flags = 0
        if (cell.isSpiked) flags |= 0x01
        if (needsColor) flags |= 0x02
        if (needsSkin) flags |= 0x04
        if (needsName) flags |= 0x08
        if (cell.isAgitated) flags |= 0x10
        if (cell.type === 3) flags |= 0x20
        w.writeUInt8(flags)

        w.writeUInt8(isNew ? 0 : 1)
        w.writeUInt8(cell.type !== -1 ? 1 : 0)
        w.writeUInt8(cell.owner?.sub ? 1 : 0)

        if (cell.owner?.clan && cell.type === 0) w.writeZTStringUTF8(cell.owner.clan)
        else w.writeUInt8(0)

        if (needsColor) w.writeColor(cell.color)
        if (needsSkin) w.writeZTStringUTF8(cell.skin)
        if (needsName) w.writeZTStringUTF8(cell.name)
    }

    private send(data: Buffer): void {
        if (this.ws.readyState === 1) this.ws.send(data)
    }
}
