# Sig-Server Rewrite Plan

## Goal
Rewrite the entire codebase with a hexagonal (ports & adapters) architecture that is minimal, very readable, and retains all core functionality.

## Architecture
```
index.ts (bootstrap)
  │
  ├── domain/        (pure game logic, no I/O)
  │   ├── types.ts   (shared types & interfaces)
  │   ├── Game.ts    (aggregate root, tick loop)
  │   ├── World.ts   (physics, spawning, cell management)
  │   ├── Player.ts  (player state, view area)
  │   ├── Cell.ts    (all cell types)
  │   ├── FFA.ts     (FFA gamemode)
  │   ├── Bot.ts     (influence-map AI)
  │   └── BitGrid.ts (pure JS spatial hash)
  │
  ├── ports/         (interfaces the domain uses)
  │   └── ports.ts   (IProtocol, ILogger)
  │
  └── adapters/      (I/O implementations)
      ├── sigmally.ts (Sigmally binary protocol)
      ├── socket.ts   (WebSocket server)
      ├── cli.ts      (terminal commands)
      ├── admin.ts    (Express admin dashboard)
      └── logger.ts   (console/file logging)
```

## What's Removed
- LegacyProtocol, ModernProtocol (only Sigmally needed)
- Teams, LastManStanding game modes (FFA only)
- Minion bots
- QuadTree (BitGrid only)
- C native addon (pure JS BitGrid instead)
- Matchmaker, ChatChannel (inlined)
- Router abstraction (merged)
- CommandList/DefaultCommands complexity (~10 essential commands)
- Stopwatch, Misc utilities (inlined)
- Go relay, userscripts (not server concerns)
- binding.gyp (no native addon)

## What's Kept
- Sigmally protocol with 256-byte shuffle
- FFA game mode with score leaderboard
- All cell types (PlayerCell, Pellet, Virus, Mothercell, EjectedCell)
- Full physics (movement, eating, collision, decay, autosplit, virus feeding)
- Influence-map PlayerBot AI
- Clan/Sub support
- Web admin dashboard (as-is)
- IP banning, connection limits, server password
- Unix socket bridge

## Implementation Phases
1. Foundation: package.json, tsconfig, types, ports, BitGrid, logger
2. Domain core: Cell, Player, World, FFA
3. AI: Bot
4. Orchestration: Game aggregate root
5. Network adapters: sigmally protocol, WebSocket server
6. CLI adapter
7. Admin adapter + static files
8. Bootstrap + cleanup
9. Verify
