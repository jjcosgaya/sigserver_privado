export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface ViewArea { x: number; y: number; w: number; h: number; s: number }
export interface Boost { dx: number; dy: number; d: number }

export type PlayerState = -1 | 0 | 1 | 2
export type CellType = 0 | 1 | 2 | 3 | 4 | -1

export interface SpawningAttrs {
    name: string; skin: string; spectating: boolean
    clan: string; showClanmates: boolean; sub: boolean
}

export interface FFAEntry {
    name: string; id: number; score: number
    highlighted: boolean; sub: boolean; position: number
}

export interface WorldStats {
    limit: number; internal: number; external: number
    playing: number; spectating: number; name: string | null
    gamemode: string; loadTime: number; uptime: number
}

export interface Settings {
    worldMapX: number; worldMapY: number; worldMapW: number; worldMapH: number
    worldSafeSpawnTries: number; worldSafeSpawnFromEjectedChance: number
    worldMultiboxSpawnNear: boolean; worldPlayerDisposeDelay: number
    worldEatMult: number; worldEatOverlapDiv: number
    playerMinSize: number; playerSpawnSize: number; playerMaxSize: number
    playerMinSplitSize: number; playerMinEjectSize: number
    playerSplitCap: number; playerEjectDelay: number; playerMaxCells: number
    playerMoveMult: number; playerSplitSizeDiv: number; playerSplitDistance: number
    playerSplitBoost: number; playerNoCollideDelay: number; playerNoMergeDelay: number
    playerMergeTime: number; playerMergeTimeIncrease: number; playerDecayMult: number
    pelletMinSize: number; pelletMaxSize: number; pelletGrowTicks: number
    pelletCount: number; pelletRewardMult: number
    ejectedSize: number; ejectingLoss: number; ejectDispersion: number
    ejectedCellBoost: number; ejectedRewardMult: number
    playerRoamSpeed: number; playerRoamViewScale: number
    playerViewScaleMult: number; playerMaxNameLength: number
    playerAllowSkinInName: boolean
    listenerForbiddenIPs: string[]; listenerAcceptedOrigins: string[]
    listenerMaxConnections: number; listenerMaxClientDormancy: number
    listenerMaxConnectionsPerIP: number; listeningPort: number
    serverFrequency: number; serverName: string
    serverGamemode: string; serverPassword: string
    chatEnabled: boolean; chatFilteredPhrases: string[]; chatCooldown: number
    worldPlayerBotsPerWorld: number
    worldPlayerBotNames: string[]; worldPlayerBotSkins: string[]
    worldMaxPlayers: number; worldMinCount: number; worldMaxCount: number
    virusMinCount: number; virusMaxCount: number; virusSize: number
    virusFeedTimes: number; virusPushing: boolean
    virusSplitBoost: number; virusPushBoost: number; virusMonotonePops: boolean
    mothercellSize: number; mothercellCount: number
    mothercellPassiveSpawnChance: number; mothercellActiveSpawnSpeed: number
    mothercellPelletBoost: number; mothercellMaxPellets: number; mothercellMaxSize: number
}

export const DEFAULT_SETTINGS: Settings = {
    worldMapX: 0, worldMapY: 0, worldMapW: 14000, worldMapH: 14000,
    worldSafeSpawnTries: 64, worldSafeSpawnFromEjectedChance: 0,
    worldMultiboxSpawnNear: true, worldPlayerDisposeDelay: 1500,
    worldEatMult: 1.140175425099138, worldEatOverlapDiv: 3,
    playerMinSize: 64, playerSpawnSize: 200, playerMaxSize: 2500,
    playerMinSplitSize: 128, playerMinEjectSize: 100,
    playerSplitCap: 255, playerEjectDelay: 0.3, playerMaxCells: 16,
    playerMoveMult: 2, playerSplitSizeDiv: 1.414213562373095, playerSplitDistance: 100,
    playerSplitBoost: 600, playerNoCollideDelay: 13, playerNoMergeDelay: 15,
    playerMergeTime: 30, playerMergeTimeIncrease: 0.02, playerDecayMult: 0.003,
    pelletMinSize: 15, pelletMaxSize: 15, pelletGrowTicks: 0,
    pelletCount: 2000, pelletRewardMult: 50,
    ejectedSize: 30, ejectingLoss: 30, ejectDispersion: 0.3,
    ejectedCellBoost: 700, ejectedRewardMult: 1,
    playerRoamSpeed: 32, playerRoamViewScale: 0.4, playerViewScaleMult: 4,
    playerMaxNameLength: 64, playerAllowSkinInName: true,
    listenerForbiddenIPs: [], listenerAcceptedOrigins: [],
    listenerMaxConnections: 100, listenerMaxClientDormancy: 60000,
    listenerMaxConnectionsPerIP: 40, listeningPort: 3000,
    serverFrequency: 25, serverName: "A sexy server",
    serverGamemode: "FFA", serverPassword: "",
    chatEnabled: true, chatFilteredPhrases: [], chatCooldown: 1000,
    worldPlayerBotsPerWorld: 0,
    worldPlayerBotNames: ["{*}Valeriy","{*}Mtch","{*}Messi","{*}Michael","{*}LadyInRed","{*}Slava","{*}Migel","{*}Mik","{*}Moon","{*}Ignasio","{*}Cos","{*}Bred","{*}Krishtianu","{*}Varpat","{*}Monica","{*}Loli","{*}Corat","{*}Sun","{*}ChaCha","{*}Voron","{*}Baby","{*}Mimi"],
    worldPlayerBotSkins: ["1%Alexander","1%Celia","1%Chip","1%Dale","1%Hardscrabble","1%Harley","1%Rocky","1%Lenny","1%Chet","1%Proctor","1%Roz","1%Art","1%Bile","1%Boo","1%Brandywine","1%Carlton","1%Derek","1%Fungus","1%George"],
    worldMaxPlayers: 50, worldMinCount: 0, worldMaxCount: 1,
    virusMinCount: 0, virusMaxCount: 0, virusSize: 100,
    virusFeedTimes: 5, virusPushing: false,
    virusSplitBoost: 880, virusPushBoost: 120, virusMonotonePops: false,
    mothercellSize: 149, mothercellCount: 0,
    mothercellPassiveSpawnChance: 0.05, mothercellActiveSpawnSpeed: 1,
    mothercellPelletBoost: 90, mothercellMaxPellets: 96, mothercellMaxSize: 65535,
}

export function mergeSettings(loaded: Partial<Settings>, defaults: Settings): Settings {
    const result = { ...defaults }
    for (const key in loaded) {
        if (key in result) (result as Record<string, unknown>)[key] = (loaded as Record<string, unknown>)[key]
    }
    return result
}
