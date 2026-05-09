import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_SETTINGS, mergeSettings } from './domain/types.js'
import type { Settings } from './domain/types.js'
import { Game } from './domain/Game.js'
import { Logger } from './adapters/logger.js'
import { CLI } from './adapters/cli.js'
import { AdminServer } from './adapters/admin.js'
import { SocketServer } from './adapters/socket.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_PATH = path.join(__dirname, '../settings.json')
const LOG_PATH = path.join(__dirname, '../logs/latest.log')

function loadSettings(): Settings {
    try {
        const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'))
        return mergeSettings(raw, DEFAULT_SETTINGS)
    } catch {
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULT_SETTINGS, null, 4))
        return { ...DEFAULT_SETTINGS }
    }
}

const settings = loadSettings()
const logger = new Logger(console.log, console.error, LOG_PATH)
const game = new Game(settings, logger)
const cli = new CLI(game)
const socketServer = new SocketServer(game)
const adminServer = new AdminServer(game)

// Ensure templates directory exists
const templatesDir = path.join(__dirname, '../templates')
if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true })

game.start()
socketServer.open()
adminServer.start()

logger.info('server ready')
