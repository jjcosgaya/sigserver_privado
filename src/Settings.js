const value = Object.seal({
    /** @type {IPAddress[]} */
    listenerForbiddenIPs: [],
    /** @type {string[]} */
    listenerAcceptedOrigins: [],
    listenerMaxConnections: 100,
    listenerMaxClientDormancy: 1000 * 60,
    listenerMaxConnectionsPerIP: 3, // OG: -1
    listeningPort: 80,

    serverFrequency: 25,
    serverName: "A Sigmally Server", // OG: "An unnamed server"
    serverGamemode: "FFA",
    serverPassword: "",

    chatEnabled: true,
    /** @type {string[]} */
    chatFilteredPhrases: [],
    chatCooldown: 1000,

    worldMapX: 0,
    worldMapY: 0,
    worldMapW: 17071, // OG: 7071
    worldMapH: 17071, // OG: 7071
    worldFinderMaxLevel: 16,
    worldFinderMaxItems: 16,
    worldSafeSpawnTries: 64,
    worldSafeSpawnFromEjectedChance: 0, // OG: 0.8
    worldMultiboxSpawnNear: true,
    worldPlayerDisposeDelay: 25 * 60,

    worldEatMult: 1.140175425099138,
    worldEatOverlapDiv: 3,

    worldPlayerBotsPerWorld: 0,
    /** @type {string[]} */
    worldPlayerBotNames: [ // can be derived from getting 1m in beta.sigmally.com, then watching the leaderboard
        "{*}Valeriy",
        "{*}Mtch",
        "{*}Messi",
        "{*}Michael",
        "{*}LadyInRed",
        "{*}Slava",
        "{*}Migel",
        "{*}Mik",
        "{*}Moon",
        "{*}Ignasio",
        "{*}Cos",
        "{*}Bred",
        "{*}Krishtianu",
        "{*}Varpat",
        "{*}Monica",
        "{*}Loli",
        "{*}Corat",
        "{*}Sun",
        "{*}ChaCha",
        "{*}Voron",
        "{*}Baby",
        "{*}Mimi"
    ], // OG: []
    /** @type {string[]} */
    worldPlayerBotSkins: [ // all free + common skins, minus Jack
        "1%Alexander",
        "1%Celia",
        "1%Chip",
        "1%Dale",
        "1%Hardscrabble",
        "1%Harley",
        "1%Rocky",
        "1%Lenny",
        "1%Chet",
        "1%Proctor",
        "1%Roz",
        "1%Art",
        "1%Bile",
        "1%Boo",
        "1%Brandywine",
        "1%Carlton",
        "1%Derek",
        "1%Fungus",
        "1%George"
    ], // OG: []
    worldMinionsPerPlayer: 0,
    worldMaxMinions: 120,
    worldMaxPlayers: 50,
    worldMinCount: 0,
    worldMaxCount: 1, // OG: 2
    matchmakerNeedsQueuing: false,
    matchmakerBulkSize: 1,

    minionName: "Minion",
    minionSpawnSize: 100, // OG: 32
    minionEnableERTPControls: false,
    minionEnableQBasedControl: true,
    minionAlwaysSplits: false,
    minionEatsViruses: true,
    minionEatsEjects: true,
    minionEatsPlayers: true,

    pelletMinSize: 20, // OG: 10
    pelletMaxSize: 20, // OG: 20
    pelletGrowTicks: 25 * 60,
    pelletCount: 21000, // OG: 1000

    virusMinCount: 20,
    virusMaxCount: 30,
    virusSize: 100,
    virusFeedTimes: 5, // OG: 7
    virusPushing: false,
    virusSplitBoost: 880, // OG: 780
    virusPushBoost: 120,
    virusMonotonePops: false,

    ejectedSize: 40, // OG: 38
    ejectingLoss: 40, // OG: 43
    ejectDispersion: 0.3,
    ejectedCellBoost: 880, // OG: 780

    mothercellSize: 149,
    mothercellCount: 0,
    mothercellPassiveSpawnChance: 0.05,
    mothercellActiveSpawnSpeed: 1,
    mothercellPelletBoost: 90,
    mothercellMaxPellets: 96,
    mothercellMaxSize: 65535,

    playerRoamSpeed: 32,
    playerRoamViewScale: 0.4,
    playerViewScaleMult: 1,
    playerMinViewScale: 0.01,
    playerMaxNameLength: 64, // OG: 16
    playerAllowSkinInName: true,

    playerMinSize: 64, // OG: 32
    playerSpawnSize: 100, // OG: 32
    playerMaxSize: 2500, // OG: 1500
    playerMinSplitSize: 128, // OG: 60
    playerMinEjectSize: 100, // OG: 60
    playerSplitCap: 255,
    playerEjectDelay: 2,
    playerMaxCells: 16,

    playerMoveMult: 2.5, // OG: 1
    playerSplitSizeDiv: 1.414213562373095,
    playerSplitDistance: 60, // OG: 40
    playerSplitBoost: 780,
    playerNoCollideDelay: 13,
    playerNoMergeDelay: 15,
    /** @type {"old" | "new"} */
    playerMergeVersion: "old",
    playerMergeTime: 30,
    playerMergeTimeIncrease: 0.02,
    playerDecayMult: 0.009 // OG: 0.001
});

module.exports = value;
