# Referencia Rápida de Comandos — Sigmally Server

## Consola Web (Dashboard)

El dashboard web corre en el puerto 5000. Una vez expuesto con Cloudflare o
Tailscale, accede desde el navegador para cambiar ajustes en caliente, ver logs
y gestionar el servidor sin entrar por terminal.

```
URL: http://localhost:5000          (local)
URL: https://xxxx.trycloudflare.com (Cloudflare Tunnel)
URL: https://tumasina.ts.net:8443   (Tailscale Funnel)
```

Contraseña por defecto: `admin` (definida en `console/index.js` o
`CONSOLE_PASSWORD`).

---

## Consola Interactiva (PM2 Attach)

Para ejecutar comandos en el servidor directamente:

```bash
pm2 status            # Ver lista de procesos y sus IDs
pm2 attach <id>       # Conectarse a la consola (ej: pm2 attach 0)
```

Para salir sin apagar el servidor: `Ctrl+C` (dos veces).

---

## Comandos de la Consola del Servidor

Se ejecutan dentro del `pm2 attach`. Prefija con `@` si estás en una
partida, o directamente si la consola está limpia.

| Comando | Ejemplo | Descripción |
|---|---|---|
| `help` | `help` | Lista todos los comandos disponibles |
| `players` | `players` | Muestra jugadores conectados (ID, mundo, score, nombre) |
| `players <world>` | `players 0` | Jugadores de un mundo específico |
| `routers` | `routers` | Muestra conexiones activas, IPs, protocolos |
| `stats` | `stats` | Carga del servidor, memoria, celdas, jugadores por mundo |
| `setting <name>` | `setting playerSpawnSize` | Ver valor actual de un ajuste |
| `setting <name> <valor>` | `setting playerMoveMult 10` | Cambiar ajuste en caliente |
| `save` | `save` | **Guarda los cambios** a `settings.json` (obligatorio) |
| `mass <id> <masa>` | `mass 3 5000` | Dar masa a un jugador |
| `kill <id>` | `kill 3` | Matar a un jugador al instante |
| `explode <id>` | `explode 3` | Explotar la célula más grande de un jugador |
| `merge <id>` | `merge 3` | Forzar que un jugador junte todas sus piezas |
| `killall <world>` | `killall 0` | Matar a todos los jugadores de un mundo |
| `addbot <world> [n]` | `addbot 0 20` | Añadir bots (jugadores automáticos) |
| `rmbot <world> [n]` | `rmbot 0 5` | Quitar bots |
| `addminion <id> [n]` | `addminion 3 5` | Asignar minions seguidores a un jugador |
| `rmminion <id> [n]` | `rmminion 3 2` | Quitar minions |
| `forbid <IP/player>` | `forbid 3` | Banear IP de un jugador o IP directa |
| `pardon <IP>` | `pardon 1.2.3.4` | Desbanear una IP |
| `restart` | `restart` | Reiniciar el sistema de mundos (sin cerrar conexiones) |
| `pause` | `pause` | Pausar/reanudar el tick del servidor |
| `eval <js>` | `eval this.settings.playerMoveMult` | Evaluar JavaScript (debug) |

---

## Comandos de Chat (Para Jugadores)

Los jugadores escriben estos comandos en el chat del juego (con `/`):

| Comando | Descripción |
|---|---|
| `/help` | Lista comandos de chat disponibles |
| `/id` | Saber tu ID de jugador |
| `/worldid` | Saber el ID del mundo en el que estás |
| `/leaveworld` | Salir del mundo actual |
| `/joinworld <id>` | Unirse a un mundo específico |

---

## Gestión con PM2 (Desde la terminal)

```bash
pm2 status                    # Estado de todos los procesos
pm2 logs sig-server           # Logs del servidor de juego
pm2 logs tunnel-game          # Logs del túnel Cloudflare (ver URL)
pm2 logs sig-console          # Logs del dashboard web
pm2 restart sig-server        # Reiniciar el servidor (aplica settings.json)
pm2 restart all               # Reiniciar todo
pm2 stop all                  # Apagar todo
pm2 start all                 | Encender todo
pm2 save                      # Guardar la lista de procesos
pm2 startup                   # Auto-arranque al reiniciar el VPS
```

---

## Ajustes Comunes (Setting)

| Objetivo | Comando |
|---|---|
| Velocidad de movimiento | `setting playerMoveMult 6` |
| Masa al aparecer | `setting playerSpawnSize 1000` |
| Masa máxima por célula | `setting playerMaxSize 5000` |
| Máximo de células | `setting playerMaxCells 64` |
| Cantidad de comida | `setting pelletCount 40000` |
| Velocidad al dividirse | `setting playerSplitBoost 1200` |
| Distancia de split | `setting playerSplitDistance 120` |
| Sin límite de IPs | `setting listenerMaxConnectionsPerIP -1` |
| Tasa de decay | `setting playerDecayMult 0.003` |

---

## Preset: Partida Rápida con Amigos

```bash
@ setting playerMoveMult 6
@ setting playerSpawnSize 1000
@ setting playerMaxCells 64
@ setting pelletCount 40000
@ setting listenerMaxConnectionsPerIP -1
@ save
```

Después ejecuta `pm2 restart sig-server` para limpiar el mapa.

---

## Notas

- Los cambios con `setting` son **en caliente** (no reinician la partida).
  Usa `save` para que persistan al reiniciar el servidor.
- Los cambios en `settings.json` requieren `pm2 restart sig-server`.
- La contraseña del dashboard se define en `console/index.js` o vía
  `CONSOLE_PASSWORD`.
