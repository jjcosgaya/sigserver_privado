const BitGrid = /*require("../ccore/index").BitGrid ||*/ require("../primitives/BitGrid");

const Minion = require("../bots/Minion");
const PlayerBot = require("../bots/PlayerBot");

const Pellet = require("../cells/Pellet");
const EjectedCell = require("../cells/EjectedCell");
const PlayerCell = require("../cells/PlayerCell");
const Mothercell = require("../cells/Mothercell");
const Virus = require("../cells/Virus");
const ChatChannel = require("../sockets/ChatChannel");

const { fullyIntersects } = require("../primitives/Misc");

/**
 * @implements {Spawner}
 */
class World {
    /**
     * @param {ServerHandle} handle
     * @param {number} id
     */
    constructor(handle, id) {
        this.handle = handle;
        this.id = id;

        this.frozen = false;

        this._nextCellId = 1;
        /** @type {Set<Cell>} */
        this.cells = new Set();
        /** @type {Cell[]} */
        this.boostingCells = [];
        this.pelletCount = 0;
        this.mothercellCount = 0;
        this.virusCount = 0;
        /** @type {EjectedCell[]} */
        this.ejectedCells = [];
        /** @type {PlayerCell[]} */
        this.playerCells = [];

        /** @type {Player[]} */
        this.players = [];
        /** @type {Player=} */
        this.largestPlayer = null;
        this.worldChat = new ChatChannel(this.handle);

        /** @type {Rect} */
        this.border = { x: NaN, y: NaN, w: NaN, h: NaN };
        /** @type {BitGrid<Cell>} */
        this.finder = null;

        /**
         * @type {WorldStats}
         */
        this.stats = {
            limit: NaN,
            internal: NaN,
            external: NaN,
            playing: NaN,
            spectating: NaN,
            name: null,
            gamemode: null,
            loadTime: NaN,
            uptime: NaN
        };

        /** @type {Cell[]} */
        this.eat = [];
        /** @type {Cell[]} */
        this.rigid = [];

        this.setBorder({ x: this.settings.worldMapX, y: this.settings.worldMapY, w: this.settings.worldMapW, h: this.settings.worldMapH });
    }

    get settings() { return this.handle.settings; }
    get nextCellId() {
        return this._nextCellId >= 4294967296 ? (this._nextCellId = 1) : this._nextCellId++;
    }

    afterCreation() {
        for (let i = 0; i < this.settings.worldPlayerBotsPerWorld; i++)
            new PlayerBot(this);
    }
    destroy() {
        while (this.players.length > 0)
            this.removePlayer(this.players[0]);
        for (const cell of this.cells)
            this.removeCell(cell);
    }

    /**
     * @param {Rect} range
     */
    setBorder(range) {
        if (this.border.x === range.x && this.border.y === range.y
                && this.border.w === range.w && this.border.h === range.h) return;
        this.border.x = range.x;
        this.border.y = range.y;
        this.border.w = range.w;
        this.border.h = range.h;
        this.finder = new BitGrid(this.border);
        for (const cell of this.cells) {
            this.finder.insert(cell);
            if (cell.type === 0) continue;
            if (!fullyIntersects(this.border, cell.range)) {
                this.removeCell(cell);
            }
        }

        for (let i = 0, l = this.players.length; i < l; i++) {
            const router = this.players[i].router;
            if (!router.isExternal) continue;
            router.protocol.onNewWorldBounds(this.border, false);
        }
    }

    /** @param {Cell} cell */
    addCell(cell) {
        cell.exists = true;
        cell.range = {
            x: cell.x,
            y: cell.y,
            w: cell.size,
            h: cell.size
        };
        this.cells.add(cell);
        this.finder.insert(cell);
        cell.onSpawned();
        this.handle.gamemode.onNewCell(cell);
    }
    /** @param {Cell} cell */
    setCellAsBoosting(cell) {
        if (cell.isBoosting) return false;
        cell.isBoosting = true;
        this.boostingCells.push(cell);
        return true;
    }
    /** @param {Cell} cell */
    setCellAsNotBoosting(cell) {
        if (!cell.isBoosting) return false;
        cell.isBoosting = false;
        this.boostingCells.splice(this.boostingCells.indexOf(cell), 1);
        return true;
    }
    /** @param {Cell} cell */
    updateCell(cell) {
        cell.range.x = cell.x;
        cell.range.y = cell.y;
        cell.range.w = cell.size;
        cell.range.h = cell.size;
        this.finder.update(cell);
    }
    /** @param {Cell} cell */
    removeCell(cell) {
        this.handle.gamemode.onCellRemove(cell);
        cell.onRemoved();
        this.finder.remove(cell);
        delete cell.range;
        this.setCellAsNotBoosting(cell);
        this.cells.delete(cell);
        cell.exists = false;
    }

    /** @param {Player} player */
    addPlayer(player) {
        this.players.push(player);
        player.world = this;
        player.hasWorld = true;
        this.worldChat.add(player.router);
        this.handle.gamemode.onPlayerJoinWorld(player, this);
        player.router.onWorldSet();
    }
    /** @param {Player} player */
    removePlayer(player) {
        this.players.splice(this.players.indexOf(player), 1);
        this.handle.gamemode.onPlayerLeaveWorld(player, this);
        player.world = null;
        player.hasWorld = false;
        this.worldChat.remove(player.router);
        while (player.ownedCells.length > 0)
            this.removeCell(player.ownedCells[0]);
        player.router.onWorldReset();
    }

    /**
     * @param {number} cellSize
     * @returns {Point}
     */
    getRandomPos(cellSize) {
        return {
            x: this.border.x - this.border.w + cellSize + Math.random() * (2 * this.border.w - cellSize),
            y: this.border.y - this.border.h + cellSize + Math.random() * (2 * this.border.h - cellSize),
        };
    }
    /**
     * @param {Rect} range
     */
    isSafeSpawnPos(range) {
        return !this.finder.containsAny(range, /** @param {Cell} other */ (item) => item.avoidWhenSpawning);
    }
    /**
     * @param {number} cellSize
     * @param {Player} [player]
     * @returns {Point}
     */
    getSafeSpawnPos(cellSize, player) {
        if (this.settings.worldMultiboxSpawnNear && player) {
            const multiboxPos = this.getMultiboxPos(player, cellSize);
            if (multiboxPos) return multiboxPos;
        }
        let tries = this.settings.worldSafeSpawnTries;
        while (--tries >= 0) {
            const pos = this.getRandomPos(cellSize);
            if (this.isSafeSpawnPos({ x: pos.x, y: pos.y, w: cellSize, h: cellSize }))
                return pos;
        }
        return this.getRandomPos(cellSize);
    }
    /**
     * @param {Player} player
     * @param {number} cellSize
     * @returns {Point | null}
     */
    getMultiboxPos(player, cellSize) {
        const ip = player.router.remoteAddress;
        if (!ip) return null;
        for (let i = 0, l = this.players.length; i < l; i++) {
            const other = this.players[i];
            if (other === player || other.router.remoteAddress !== ip || other.ownedCells.length === 0)
                continue;
            const cell = other.ownedCells[~~(Math.random() * other.ownedCells.length)];
            let tries = this.settings.worldSafeSpawnTries;
            while (--tries >= 0) {
                const angle = Math.random() * Math.PI * 2;
                const dist = cell.size + cellSize + 100 + Math.random() * 200;
                const pos = {
                    x: Math.max(this.border.x - this.border.w + cellSize, Math.min(cell.x + Math.cos(angle) * dist, this.border.x + this.border.w - cellSize)),
                    y: Math.max(this.border.y - this.border.h + cellSize, Math.min(cell.y + Math.sin(angle) * dist, this.border.y + this.border.h - cellSize))
                };
                if (this.isSafeSpawnPos({ x: pos.x, y: pos.y, w: cellSize, h: cellSize }))
                    return pos;
            }
        }
        return null;
    }
    /**
     * @param {number} cellSize
     * @param {Player} [player]
     * @returns {{ color: number, pos: Point }}
     */
    getPlayerSpawn(cellSize, player) {
        if (this.settings.worldSafeSpawnFromEjectedChance > Math.random() && this.ejectedCells.length > 0) {
            let tries = this.settings.worldSafeSpawnTries;
            while (--tries >= 0) {
                const cell = this.ejectedCells[~~(Math.random() * this.ejectedCells.length)];
                if (this.isSafeSpawnPos({ x: cell.x, y: cell.y, w: cellSize, h: cellSize })) {
                    this.removeCell(cell);
                    return { color: cell.color, pos: { x: cell.x, y: cell.y } };
                }
            }
        }
        return { color: null, pos: this.getSafeSpawnPos(cellSize, player) };
    }

    /**
     * @param {Player} player
     * @param {Point} pos
     * @param {number} size
     */
    spawnPlayer(player, pos, size) {
        const playerCell = new PlayerCell(player, pos.x, pos.y, size);
        this.addCell(playerCell);
        player.updateState(0);
    }

    update() {
        this.frozen ? this.frozenUpdate() : this.liveUpdate();
    }

    frozenUpdate() {
        for (let i = 0, l = this.players.length; i < l; i++) {
            const router = this.players[i].router;
            router.splitAttempts = 0;
            router.ejectAttempts = 0;
            if (router.isPressingQ) {
                if (!router.hasProcessedQ)
                    router.onQPress();
                router.hasProcessedQ = true;
            } else router.hasProcessedQ = false;

            router.spawningAttributes = null;
        }
    }

    liveUpdate() {
        this.handle.gamemode.onWorldTick(this);
        this.finder.clean?.();

        /** @type {number} */
        let i;
        /** @type {number} */
        let l;

        this.setBorder({ x: this.settings.worldMapX, y: this.settings.worldMapY, w: this.settings.worldMapW, h: this.settings.worldMapH });

        for (const cell of this.cells)
            cell.onTick();

        while (this.pelletCount < this.settings.pelletCount) {
            const pos = this.getSafeSpawnPos(this.settings.pelletMinSize);
            this.addCell(new Pellet(this, this, pos.x, pos.y));
        }
        while (this.virusCount < this.settings.virusMinCount) {
            const pos = this.getSafeSpawnPos(this.settings.virusSize);
            this.addCell(new Virus(this, pos.x, pos.y, this.settings.virusSize));
        }
        while (this.mothercellCount < this.settings.mothercellCount) {
            const pos = this.getSafeSpawnPos(this.settings.mothercellSize);
            this.addCell(new Mothercell(this, pos.x, pos.y));
        }

        for (i = 0, l = this.boostingCells.length; i < l;) {
            if (!this.boostCell(this.boostingCells[i])) l--;
            else i++;
        }

        let eatL = 0;
        let rigidL = 0;
        this.eat.fill();
        this.rigid.fill();
        for (i = 0; i < l; i++) {
            const cell = this.boostingCells[i];
            if (cell.type !== 2 && cell.type !== 3) continue;
            this.finder.search(cell.range, (other) => {
                if (cell.id === other.id) return;
                switch (cell.getEatResult(other)) {
                    case 1: this.rigid[rigidL++] = cell; this.rigid[rigidL++] = other; break;
                    case 2: this.eat[eatL++] = cell; this.eat[eatL++] = other; break;
                    case 3: this.eat[eatL++] = other; this.eat[eatL++] = cell; break;
                }
            });
        }

        for (i = 0, l = this.playerCells.length; i < l; i++) {
            const cell = this.playerCells[i];
            this.movePlayerCell(cell);
            this.decayPlayerCell(cell);
            this.autosplitPlayerCell(cell);
            this.bounceCell(cell);
            this.updateCell(cell);
        }

        for (i = 0, l = this.playerCells.length; i < l; i++) {
            const cell = this.playerCells[i];
            this.finder.search(cell.range, (other) => {
                if (cell.id === other.id) return;
                switch (cell.getEatResult(other)) {
                    case 1: this.rigid[rigidL++] = cell; this.rigid[rigidL++] = other; break;
                    case 2: this.eat[eatL++] = cell; this.eat[eatL++] = other; break;
                    case 3: this.eat[eatL++] = other; this.eat[eatL++] = cell; break;
                }
            }, true);
        }

        for (i = 0; i < rigidL;)
            this.resolveRigidCheck(this.rigid[i++], this.rigid[i++]);
        for (i = 0; i < eatL;)
            this.resolveEatCheck(this.eat[i++], this.eat[i++]);

        this.largestPlayer = null;
        for (i = 0, l = this.players.length; i < l; i++) {
            const player = this.players[i];
            if (!isNaN(player.score) && (this.largestPlayer === null || player.score > this.largestPlayer.score))
                this.largestPlayer = player;
        }

        for (i = 0, l = this.players.length; i < l; i++) {
            const player = this.players[i];
            player.checkExistence();
            if (!player.exists) { i--; l--; continue; }
            if (player.state === 1 && this.largestPlayer == null)
                player.updateState(2);
            const router = player.router;
            for (let j = 0, k = this.settings.playerSplitCap; j < k && router.splitAttempts > 0; j++) {
                router.attemptSplit();
                router.splitAttempts--;
            }
            const nextEjectTick = this.handle.tick - this.settings.playerEjectDelay;
            if (router.ejectAttempts > 0 && nextEjectTick >= router.ejectTick) {
                router.attemptEject();
                router.ejectAttempts = 0;
                router.ejectTick = this.handle.tick;
            }
            if (router.isPressingQ) {
                if (!router.hasProcessedQ)
                    router.onQPress();
                router.hasProcessedQ = true;
            } else router.hasProcessedQ = false;
            if (router.spawningAttributes !== null) {
                if (router.spawningAttributes.spectating) router.onSpectateRequest();
                else router.onSpawnRequest();
                router.spawningAttributes = null;
            }
            player.updateViewArea();
        }

        const notPlaying = [];
        const playing = [];
        for (i = 0, l = this.players.length; i < l; i++) {
            const player = this.players[i];
            if (!(player.router instanceof Connection)) continue;
            if ((player.state === 0 || player.state === 1) && player.leaderboardName !== null) {
                playing.push(player);
            } else {
                notPlaying.push(player);
            }
        }

        let targetMinions = 0;
        if (this.handle.settings.worldMinionsPerPlayer > 0 && this.handle.settings.worldMaxMinions > 0 && playing.length > 0) {
            targetMinions = Math.min(
                this.handle.settings.worldMinionsPerPlayer,
                Math.ceil(this.handle.settings.worldMaxMinions / playing.length)
            );
        }

        for (i = 0, l = playing.length; i < l; i++) {
            const player = playing[i];
            for (let j = player.router.minions.length - 1; j >= targetMinions; j--)
                player.router.minions[j].close();
            for (let j = player.router.minions.length; j < targetMinions; j++)
                new Minion(player.router);
        }

        for (i = 0, l = notPlaying.length; i < l; i++) {
            const player = notPlaying[i];
            while (player.router.minions.length > 0) player.router.minions[0].close();
        }

        this.compileStatistics();
        this.handle.gamemode.compileLeaderboard(this);

        if (this.stats.external <= 0 && Object.keys(this.handle.worlds).length - 1 > this.settings.worldMinCount)
            this.handle.removeWorld(this.id);
    }

    /**
     * @param {Cell} a
     * @param {Cell} b
     */
    resolveRigidCheck(a, b) {
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        const m = a.size + b.size - d;
        if (m <= 0) return;
        if (d === 0) d = 1, dx = 1, dy = 0;
        else dx /= d, dy /= d;
        const M = a.squareSize + b.squareSize;
        const aM = b.squareSize / M;
        const bM = a.squareSize / M;
        a.x -= dx * m * aM;
        a.y -= dy * m * aM;
        b.x += dx * m * bM;
        b.y += dy * m * bM;
        this.bounceCell(a);
        this.bounceCell(b);
        this.updateCell(a);
        this.updateCell(b);
    }

    /**
     * @param {Cell} a
     * @param {Cell} b
     */
    resolveEatCheck(a, b) {
        if (!a.exists || !b.exists) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > a.size - b.size / this.settings.worldEatOverlapDiv) return;
        if (!this.handle.gamemode.canEat(a, b)) return;
        a.whenAte(b);
        b.whenEatenBy(a);
        this.removeCell(b);
        this.updateCell(a);
    }

    /**
     * @param {Cell} cell
     */
    boostCell(cell) {
        const d = cell.boost.d / 9 * this.handle.stepMult;
        cell.x += cell.boost.dx * d;
        cell.y += cell.boost.dy * d;
        this.bounceCell(cell, true);
        this.updateCell(cell);
        if ((cell.boost.d -= d) >= 1) return true;
        this.setCellAsNotBoosting(cell);
        return false;
    }

    /**
     * @param {Cell} cell
     * @param {boolean=} bounce
     */
    bounceCell(cell, bounce) {
        const r = cell.size / 2;
        const b = this.border;
        if (cell.x <= b.x - b.w + r) {
            cell.x = b.x - b.w + r;
            if (bounce) cell.boost.dx = -cell.boost.dx;
        }
        if (cell.x >= b.x + b.w - r) {
            cell.x = b.x + b.w - r;
            if (bounce) cell.boost.dx = -cell.boost.dx;
        }
        if (cell.y <= b.y - b.h + r) {
            cell.y = b.y - b.h + r;
            if (bounce) cell.boost.dy = -cell.boost.dy;
        }
        if (cell.y >= b.y + b.h - r) {
            cell.y = b.y + b.h - r;
            if (bounce) cell.boost.dy = -cell.boost.dy;
        }
    }

    /**
     * @param {Virus} virus
     */
    splitVirus(virus) {
        const newVirus = new Virus(this, virus.x, virus.y, this.settings.virusSize);
        newVirus.boost.dx = Math.sin(virus.splitAngle);
        newVirus.boost.dy = Math.cos(virus.splitAngle);
        newVirus.boost.d = this.settings.virusSplitBoost;
        this.addCell(newVirus);
        this.setCellAsBoosting(newVirus);
    }

    /**
     * @param {PlayerCell} cell
     */
    movePlayerCell(cell) {
        const router = cell.owner.router;
        if (router.disconnected) return;
        let dx = router.mouseX - cell.x;
        let dy = router.mouseY - cell.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) return; dx /= d; dy /= d;
        const m = Math.min(cell.moveSpeed, d) * this.handle.stepMult;
        cell.x += dx * m;
        cell.y += dy * m;
    }
    /**
     * @param {PlayerCell} cell
     */
    decayPlayerCell(cell) {
        const newSize = cell.size - cell.size * this.handle.gamemode.getDecayMult(cell) / 50 * this.handle.stepMult;
        cell.size = Math.max(newSize, this.settings.playerMinSize);
    }
    /**
     * @param {PlayerCell} cell
     * @param {number} size
     * @param {Boost} boost
     */
    launchPlayerCell(cell, size, boost) {
        cell.squareSize -= size * size;
        const x = cell.x + this.settings.playerSplitDistance * boost.dx;
        const y = cell.y + this.settings.playerSplitDistance * boost.dy;
        const newCell = new PlayerCell(cell.owner, x, y, size);
        newCell.boost.dx = boost.dx;
        newCell.boost.dy = boost.dy;
        newCell.boost.d = boost.d;
        this.addCell(newCell);
        this.setCellAsBoosting(newCell);
    }
    /**
     * @param {PlayerCell} cell
     */
    autosplitPlayerCell(cell) {
        const minSplit = this.settings.playerMaxSize * this.settings.playerMaxSize;
        const cellsLeft = 1 + this.settings.playerMaxCells - cell.owner.ownedCells.length;
        const overflow = Math.ceil(cell.squareSize / minSplit);
        if (overflow === 1 || cellsLeft <= 0) return;
        const splitTimes = Math.min(overflow, cellsLeft);
        const splitSize = Math.min(Math.sqrt(cell.squareSize / splitTimes), this.settings.playerMaxSize);
        for (let i = 1; i < splitTimes; i++) {
            const angle = Math.random() * 2 * Math.PI;
            this.launchPlayerCell(cell, splitSize, {
                dx: Math.sin(angle),
                dy: Math.cos(angle),
                d: this.settings.playerSplitBoost
            });
        }
        cell.size = splitSize;
    }

    /**
     * @param {Player} player
     */
    splitPlayer(player) {
        const router = player.router;
        const l = player.ownedCells.length;
        for (let i = 0; i < l; i++) {
            if (player.ownedCells.length >= this.settings.playerMaxCells)
                break;
            const cell = player.ownedCells[i];
            if (cell.size < this.settings.playerMinSplitSize)
                continue;
            let dx = router.mouseX - cell.x;
            let dy = router.mouseY - cell.y;
            let d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1) dx = 1, dy = 0, d = 1;
            else dx /= d, dy /= d;
            this.launchPlayerCell(cell, cell.size / this.settings.playerSplitSizeDiv, {
                dx: dx,
                dy: dy,
                d: this.settings.playerSplitBoost
            });
        }
    }
    /**
     * @param {Player} player
     */
    ejectFromPlayer(player) {
        const dispersion = this.settings.ejectDispersion;
        const loss = this.settings.ejectingLoss * this.settings.ejectingLoss;
        const router = player.router;
        const l = player.ownedCells.length;
        for (let i = 0; i < l; i++) {
            const cell = player.ownedCells[i];
            if (cell.size < this.settings.playerMinEjectSize)
                continue;
            let dx = router.mouseX - cell.x;
            let dy = router.mouseY - cell.y;
            let d = Math.sqrt(dx * dx + dy * dy);
            if (d < 1) dx = 1, dy = 0, d = 1;
            else dx /= d, dy /= d;
            const sx = cell.x + dx * cell.size;
            const sy = cell.y + dy * cell.size;
            const newCell = new EjectedCell(this, player, sx, sy, cell.color);
            const a = Math.atan2(dx, dy) - dispersion + Math.random() * 2 * dispersion;
            newCell.boost.dx = Math.sin(a);
            newCell.boost.dy = Math.cos(a);
            newCell.boost.d = this.settings.ejectedCellBoost;
            this.addCell(newCell);
            this.setCellAsBoosting(newCell);
            cell.squareSize -= loss;
            this.updateCell(cell);
        }
    }

    /**
     * @param {PlayerCell} cell
     */
    popPlayerCell(cell) {
        const splits = this.distributeCellMass(cell);
        for (let i = 0, l = splits.length; i < l; i++) {
            const angle = Math.random() * 2 * Math.PI;
            this.launchPlayerCell(cell, Math.sqrt(splits[i] * 100), {
                dx: Math.sin(angle),
                dy: Math.cos(angle),
                d: this.settings.playerSplitBoost
            });
        }
    }

    /**
     * @param {PlayerCell} cell
     * @returns {number[]}
     */
    distributeCellMass(cell) {
        const player = cell.owner;
        let cellsLeft = this.settings.playerMaxCells - player.ownedCells.length;
        if (cellsLeft <= 0) return [];
        let splitMin = this.settings.playerMinSplitSize;
        splitMin = splitMin * splitMin / 100;
        const cellMass = cell.mass;
        if (this.settings.virusMonotonePops) {
            const amount = Math.min(Math.floor(cellMass / splitMin), cellsLeft);
            const perPiece = cellMass / (amount + 1);
            return new Array(amount).fill(perPiece);
        }
        if (cellMass / cellsLeft < splitMin) {
            let amount = 2, perPiece = NaN;
            while ((perPiece = cellMass / (amount + 1)) >= splitMin && amount * 2 <= cellsLeft)
                amount *= 2;
            return new Array(amount).fill(perPiece);
        }
        const splits = [];
        let nextMass = cellMass / 2;
        let massLeft = cellMass / 2;
        while (cellsLeft > 0) {
            if (nextMass / cellsLeft < splitMin) break;
            while (nextMass >= massLeft && cellsLeft > 1)
                nextMass /= 2;
            splits.push(nextMass);
            massLeft -= nextMass;
            cellsLeft--;
        }
        nextMass = massLeft / cellsLeft;
        return splits.concat(new Array(cellsLeft).fill(nextMass));
    }

    compileStatistics() {
        let internal = 0, external = 0, playing = 0, spectating = 0;
        for (let i = 0, l = this.players.length; i < l; i++) {
            const player = this.players[i];
            if (!player.router.isExternal) { internal++; continue; }
            external++;
            if (player.state === 0) playing++;
            else if (player.state === 1 || player.state === 2)
                spectating++;
        }
        this.stats.limit = this.settings.listenerMaxConnections - this.handle.listener.connections.length + external;
        this.stats.internal = internal;
        this.stats.external = external;
        this.stats.playing = playing;
        this.stats.spectating = spectating;
        this.stats.name = this.settings.serverName;
        this.stats.gamemode = this.handle.gamemode.name;
        this.stats.loadTime = this.handle.averageTickTime / this.handle.stepMult;
        this.stats.uptime = Math.floor((Date.now() - this.handle.startTime.getTime()) / 1000);
    }
}

module.exports = World;

const Cell = require("../cells/Cell");
const Connection = require("../sockets/Connection");
const Player = require("./Player");
const ServerHandle = require("../ServerHandle");
