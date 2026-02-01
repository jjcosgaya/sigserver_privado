const Protocol = require("./Protocol");
const Reader = require("../primitives/Reader");
const Writer = require("../primitives/Writer");

const shuffleArray = [];
for (let i = 0; i < 256; ++i) shuffleArray.push(i);
shuffleArray.sort(() => Math.random() - 0.5);
const shuffle = Buffer.from(shuffleArray);

const unshuffle = Buffer.alloc(256);
for (let i = 0; i < 256; ++i) {
    unshuffle[shuffle[i]] = i;
}

class SigmallyProtocol extends Protocol {
    /**
     * @param {Connection} connection
     */
    constructor(connection) {
        super(connection);
        this.protocol = NaN;
    }

    static get type() { return "sigmally"; }
    get subtype() { return `s${!isNaN(this.protocol) ? ("00" + this.protocol).slice(-2) : "//"}`; }

    /**
     * @param {Reader} reader
     */
    distinguishes(reader) {
        if (reader.readZTStringUTF8() !== "SIG 0.0.1") return false;

        this.protocol = 1;
        this.connection.createPlayer();

        const writer = new Writer();
        writer.writeZTStringUTF8("SIG 0.0.1");
        writer.writeBytes(shuffle);
        this.connection.send(writer.finalize());

        return true;
    }

    /**
     * @param {Reader} reader
     */
    onSocketMessage(reader) {
        const messageId = unshuffle[reader.readUInt8()];
        switch (messageId) {
            case 0:
                if (reader.length < 2)
                    return void this.connection.close();

                let body;
                try {
                    const bodyString = reader.readZTStringUTF8();
                    body = JSON.parse(bodyString);
                } catch (_) {
                    return void this.fail(1003, "Unexpected message format");
                }

                if (
                    typeof body.name !== "string"
                    || (body.skin && typeof body.skin !== "string")
                    || (body.clan && typeof body.clan !== "string")
                )
                    return void console.log(body), this.connection.close();

                const spectating = body.state ==/*=*/ 2;
                if (!spectating && this.handle.settings.serverPassword && this.handle.settings.serverPassword !== body.password) {
                    this.connection.send(Buffer.from([ shuffle[0xb4] ]));
                    return;
                }

                this.connection.spawningAttributes = {
                    name: body.name,
                    skin: body.skin ? body.skin.substring(0, 20) : "",
                    spectating,
                    clan: body.clan || "",
                    showClanmates: !!body.showClanmates,
                    sub: !!body.sub,
                };
                break;
            case 16:
                switch (reader.length) {
                    case 13:
                        this.connection.mouseX = reader.readInt32();
                        this.connection.mouseY = reader.readInt32();
                        break;
                    case 9:
                        this.connection.mouseX = reader.readInt16();
                        this.connection.mouseY = reader.readInt16();
                        break;
                    case 21:
                        this.connection.mouseX = ~~reader.readFloat64();
                        this.connection.mouseY = ~~reader.readFloat64();
                        break;
                    default: return void this.fail(1003, "Unexpected message format");
                }
                break;
            case 17:
                if (this.connection.controllingMinions)
                    for (let i = 0, l = this.connection.minions.length; i < l; i++)
                        this.connection.minions[i].splitAttempts++;
                else this.connection.splitAttempts++;
                break;
            case 18: this.connection.isPressingQ = true; break;
            case 19: this.connection.isPressingQ = this.hasProcessedQ = false; break;
            case 21:
                if (this.connection.controllingMinions)
                    for (let i = 0, l = this.connection.minions.length; i < l; i++)
                        this.connection.minions[i].ejectAttempts++;
                else this.connection.ejectAttempts++;
                break;
            case 22:
                if (!this.settings.minionEnableERTPControls) break;
                for (let i = 0, l = this.connection.minions.length; i < l; i++)
                    this.connection.minions[i].splitAttempts++;
                break;
            case 23:
                if (!this.settings.minionEnableERTPControls) break;
                for (let i = 0, l = this.connection.minions.length; i < l; i++)
                    this.connection.minions[i].ejectAttempts++;
                break;
            case 24:
                if (!this.settings.minionEnableERTPControls) break;
                this.connection.minionsFrozen = !this.connection.minionsFrozen;
                break;
            case 99:
                if (reader.length < 2)
                    return void this.fail(1003, "Bad message format");
                const flags = reader.readUInt8();
                const skipLen = 2 * ((flags & 2) + (flags & 4) + (flags & 8))
                if (reader.length < 2 + skipLen)
                    return void this.fail(1003, "Unexpected message format");
                reader.skip(skipLen);
                const message = reader.readZTStringUTF8();
                this.connection.onChatMessage(message);
                break;
            case 0xbf:
                // playtime quest
            case 0xc0:
                // food quest
            case 0xd0:
                // analytics
                break;
            case 254:
                if (this.connection.hasPlayer && this.connection.player.hasWorld)
                    this.onStatsRequest();
                break;
            default:
                if (Date.now() - this.connection.connectTime > 5000)
                    return void this.fail();
        }
    }

    /**
     * @param {ChatSource} source
     * @param {string} message
     */
    onChatMessage(source, message) {
        const writer = new Writer();
        writer.writeUInt8(shuffle[99]);
        writer.writeUInt8(source.isServer * 128);
        writer.writeColor(source.color);
        writer.writeZTStringUTF8(source.name);
        writer.writeZTStringUTF8(message);
        this.send(writer.finalize());
    }

    onStatsRequest() {
        const writer = new Writer();
        writer.writeUInt8(shuffle[254]);
        const stats = this.connection.player.world.stats;
        const legacy = {
            mode: stats.gamemode,
            update: stats.loadTime,
            playersTotal: stats.external,
            playersAlive: stats.playing,
            playersSpect: stats.spectating,
            playersLimit: stats.limit
        };
        writer.writeZTStringUTF8(JSON.stringify(Object.assign({}, legacy, stats)));
        this.send(writer.finalize());
    }

    /**
     * @param {PlayerCell} cell
     */
    onNewOwnedCell(cell) {
        const writer = new Writer();
        writer.writeUInt8(shuffle[32]);
        writer.writeUInt32(cell.id);
        this.send(writer.finalize());
    }

    /**
     * @param {Rect} range
     */
    onNewWorldBounds(range) {
        const writer = new Writer();
        writer.writeUInt8(shuffle[64]);
        writer.writeFloat64(range.x - range.w);
        writer.writeFloat64(range.y - range.h);
        writer.writeFloat64(range.x + range.w);
        writer.writeFloat64(range.y + range.h);
        this.send(writer.finalize());
    }

    onWorldReset() {
        const writer = new Writer();
        writer.writeUInt8(shuffle[18]);
        this.send(writer.finalize());
        if (this.lastLeaderboardType !== null) {
            this.onLeaderboardUpdate(this.lastLeaderboardType, [], null);
            this.lastLeaderboardType = null;
        }
    }

    /**
     * @param {LeaderboardType} type
     * @param {LeaderboardDataType[type][]} data
     * @param {LeaderboardDataType[type]=} selfData
     */
    onLeaderboardUpdate(type, data, selfData) {
        this.lastLeaderboardType = type;
        const writer = new Writer();
        switch (type) {
            case "ffa":
                writer.writeUInt8(shuffle[49]);
                writer.writeUInt32(data.length);
                for (let i = 0, l = data.length; i < l; i++) {
                    const item = data[i];
                    writer.writeUInt32(item.highlighted ? 1 : 0);
                    writer.writeZTStringUTF8(item.name);

                    writer.writeUInt32(selfData?.position ?? 0);
                    writer.writeUInt32(item.sub);
                }
                break;

            case "pie":
                writer.writeUInt8(shuffle[50]);
                writer.writeUInt32(data.length);
                for (let i = 0, l = data.length; i < l; i++)
                    writer.writeFloat32(data[i].weight);
                break;

            case "text":
                writer.writeUInt8(shuffle[48]);
                writer.writeUInt32(data.length);
                for (let i = 0, l = data.length; i < l; i++)
                    writer.writeZTStringUTF8(data[i]);
        }

        this.send(writer.finalize());
    }

    /**
     * @param {ViewArea} viewArea
     */
    onSpectatePosition(viewArea) {
        const writer = new Writer();
        writer.writeUInt8(shuffle[17]);
        writer.writeFloat32(viewArea.x);
        writer.writeFloat32(viewArea.y);
        writer.writeFloat32(viewArea.s);
        this.send(writer.finalize());
    }

    /**
     * @abstract
     * @param {Cell[]} add
     * @param {Cell[]} upd
     * @param {Cell[]} eat
     * @param {Cell[]} del
     */
    onVisibleCellUpdate(add, upd, eat, del) {
        const source = this.connection.player;
        const writer = new Writer();
        writer.writeUInt8(shuffle[16]);
        let i, l, cell;

        l = eat.length;
        writer.writeUInt16(l);
        for (i = 0; i < l; i++) {
            cell = eat[i];
            writer.writeUInt32(cell.eatenBy.id);
            writer.writeUInt32(cell.id);
        }

        for (i = 0, l = add.length; i < l; i++) {
            cell = add[i];
            writeCellData6(writer, source, cell,
                true, true, true, true, true, true);
        }
        for (i = 0, l = upd.length; i < l; i++) {
            cell = upd[i];
            writeCellData6(writer, source, cell,
                false, cell.sizeChanged, cell.posChanged, cell.colorChanged, cell.nameChanged, cell.skinChanged);
        }
        writer.writeUInt32(0);

        l = del.length;
        writer.writeUInt16(l);
        for (i = 0; i < l; i++) writer.writeUInt32(del[i].id);
        this.send(writer.finalize());
    }
}

module.exports = SigmallyProtocol;

/**
 * @param {Writer} writer
 * @param {Player} source
 * @param {Cell} cell
 * @param {boolean} includeType
 * @param {boolean} includeSize
 * @param {boolean} includePos
 * @param {boolean} includeColor
 * @param {boolean} includeName
 * @param {boolean} includeSkin
 */
function writeCellData6(writer, source, cell, includeType, includeSize, includePos, includeColor, includeName, includeSkin) {
    writer.writeUInt32(cell.id);
    writer.writeInt16(cell.x);
    writer.writeInt16(cell.y);
    writer.writeUInt16(cell.size);

    let flags = 0;
    if (cell.isSpiked) flags |= 0x01;
    if (includeColor) flags |= 0x02;
    if (includeSkin) flags |= 0x04;
    if (includeName) flags |= 0x08;
    if (cell.isAgitated) flags |= 0x10;
    if (cell.type === 3) flags |= 0x20;
    writer.writeUInt8(flags);

    writer.writeUInt8(includeType ? 0 : 1); // isUpdate
    writer.writeUInt8(cell.type !== -1 ? 1 : 0); // isPlayer
    writer.writeUInt8(cell.owner?.sub ? 1 : 0);
    // only write clan on player cells, not ejected cells
    if (cell.owner?.clan && cell.type === 0) writer.writeZTStringUTF8(cell.owner.clan);
    else writer.writeUInt8(0);

    if (includeColor) writer.writeColor(cell.color);
    if (includeSkin) writer.writeZTStringUTF8(cell.skin);
    if (includeName) writer.writeZTStringUTF8(cell.name);
}

const Cell = require("../cells/Cell");
const Player = require("../worlds/Player");
const PlayerCell = require("../cells/PlayerCell");
const Connection = require("../sockets/Connection");
