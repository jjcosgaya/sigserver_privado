import * as fs from 'fs'
import * as path from 'path'
import type { ILogger } from '../ports/ports.js'

export class Logger implements ILogger {
    private out: (msg: string) => void
    private err: (msg: string) => void
    private logFile: string | null = null
    private stream: fs.WriteStream | null = null

    constructor(out: (msg: string) => void = console.log, err: (msg: string) => void = console.error, logFilePath?: string) {
        this.out = out
        this.err = err
        if (logFilePath) {
            const dir = path.dirname(logFilePath)
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
            this.logFile = logFilePath
            this.stream = fs.createWriteStream(logFilePath, { flags: 'a' })
        }
    }

    private write(prefix: string, ...msg: unknown[]): void {
        const text = `${prefix} ${msg.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' ')}`
        this.out(text)
        if (this.stream) this.stream.write(text + '\n')
    }

    private writeErr(prefix: string, ...msg: unknown[]): void {
        const text = `${prefix} ${msg.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' ')}`
        this.err(text)
        if (this.stream) this.stream.write(text + '\n')
    }

    print(...msg: unknown[]): void { this.write('[PRINT]', ...msg) }
    debug(...msg: unknown[]): void { this.write('[DEBUG]', ...msg) }
    info(...msg: unknown[]): void { this.write('[INFO]', ...msg) }
    warn(...msg: unknown[]): void { this.write('[WARN]', ...msg) }
    error(...msg: unknown[]): void { this.writeErr('[ERROR]', ...msg) }
}
