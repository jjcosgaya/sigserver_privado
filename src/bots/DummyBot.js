const Bot = require("./Bot");

class DummyBot extends Bot {
    /** @type {DummyBot[]} */
    static _instances = [];

    /**
     * @param {World} world
     * @param {number} mass
     */
    constructor(world, mass) {
        super(world);

        this.spawnMass = mass;
        this.spawnDummy();
        DummyBot._instances.push(this);
    }

    static get type() { return "dummybot"; }
    static get separateInTeams() { return false; }

    get shouldClose() { return false; }

    /** hold the cell in place — point mouse at the cell so the world doesn't move it */
    update() {
        const cell = this.player.ownedCells[0];
        if (cell) {
            this.mouseX = cell.x;
            this.mouseY = cell.y;
        }
    }

    close() {
        const idx = DummyBot._instances.indexOf(this);
        if (idx !== -1) DummyBot._instances.splice(idx, 1);
        super.close();
    }

    spawnDummy() {
        const world = this.player.world;
        const size = Math.sqrt(100 * this.spawnMass);

        this.spawningAttributes = { name: "Dummy", skin: '', spectating: false, clan: '', showClanmates: false };
        this.onSpawnRequest();
        this.spawningAttributes = null;

        this.player.leaderboardName = null;

        const cell = this.player.ownedCells[0];
        if (!cell) return;

        if (DummyBot._instances.filter(d => d.player.world === world).length === 0) {
            cell.x = world.border.x;
            cell.y = world.border.y;
        }

        cell.mass = this.spawnMass;
        this.mouseX = cell.x;
        this.mouseY = cell.y;
        world.updateCell(cell);
    }

    regenerate() {
        const world = this.player.world;
        const cellData = this.player.ownedCells.map(c => ({
            x: c.x, y: c.y, mass: c.mass
        }));

        while (this.player.ownedCells.length > 0)
            world.removeCell(this.player.ownedCells[0]);

        this.spawningAttributes = { name: "Dummy", skin: '', spectating: false, clan: '', showClanmates: false };
        this.onSpawnRequest();
        this.spawningAttributes = null;

        this.player.leaderboardName = null;

        const newCells = this.player.ownedCells;
        for (let i = 0; i < cellData.length && i < newCells.length; i++) {
            newCells[i].x = cellData[i].x;
            newCells[i].y = cellData[i].y;
            newCells[i].mass = cellData[i].mass;
            this.mouseX = cellData[i].x;
            this.mouseY = cellData[i].y;
            world.updateCell(newCells[i]);
        }
    }

    /**
     * @param {World} world
     * @returns {DummyBot[]}
     */
    static getDummiesInWorld(world) {
        return DummyBot._instances.filter(d => d.player.world === world);
    }
}

module.exports = DummyBot;

const World = require("../worlds/World");
