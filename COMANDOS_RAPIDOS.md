# 🎮 Guía Rápida de Comandos - Sigmally Server

Esta guía resume cómo gestionar tu servidor una vez que ya está funcionando en Oracle Cloud con PM2.

---

## 1. Cómo entrar a la Consola
Para escribir comandos, primero debes "conectarte" al proceso del servidor:
```bash
# Mira el ID de tu servidor (columna id, suele ser 0, 1, 2...)
pm2 status

# Conéctate usando el ID (ejemplo: si el ID es 3)
pm2 attach 3
```
*Para salir de la consola sin apagar el servidor: pulsa `Ctrl+C`.*

---

## 2. Comandos de Configuración (`setting`)
**IMPORTANTE:** El comando es siempre en **singular** (`setting`), no `settings`.

| Objetivo | Comando |
| :--- | :--- |
| **Quitar límite de IPs** | `@ setting listenerMaxConnectionsPerIP -1` |
| **Aumentar velocidad** | `@ setting playerMoveMult 10` |
| **Masa al aparecer** | `@ setting playerSpawnSize 500` |
| **Masa máxima celda** | `@ setting playerMaxSize 5000` |
| **Cantidad de comida** | `@ setting pelletCount 20000` |
| **Ver valor actual** | `@ setting nombreDelAjuste` |
| **GUARDAR CAMBIOS** | `@ save` (Obligatorio para que no se pierdan al reiniciar) |

---

## 3. Comandos de Administración
Úsalos dentro de la consola (`pm2 attach`):

- **`players`**: Muestra la lista de jugadores conectados y sus **IDs**.
- **`mass <ID> <masa>`**: Da masa a un jugador. Ejemplo: `@ mass 1 5000`.
- **`kill <ID>`**: Mata a un jugador al instante.
- **`merge <ID>`**: Fuerza a un jugador a juntar todas sus piezas.
- **`addbot 0 <cantidad>`**: Añade bots al mapa. Ejemplo: `@ addbot 0 20`.
- **`stats`**: Muestra carga del servidor, memoria y celdas totales.
- **`help`**: Muestra la lista completa de comandos disponibles.

---

## 4. Gestión con PM2 (Desde la terminal normal)
Estos comandos se ejecutan directamente en la terminal de Ubuntu (fuera de `attach`):

- **`pm2 restart sig-server`**: Reinicia el juego (aplica cambios de `settings.json`).
- **`pm2 logs sig-server`**: Mira si hay errores si alguien no puede conectar.
- **`pm2 logs tunnel`**: Para ver la URL de Cloudflare (`https://...trycloudflare.com`).
- **`pm2 stop all`**: Apaga el servidor y el túnel.
- **`pm2 start all`**: Enciende todo de nuevo.

---

## 5. Ajustes para "Servidor Loco" (Recomendado para amigos)
Si quieres una partida rápida y divertida, mete estos comandos uno a uno:
```bash
@ setting playerMoveMult 6
@ setting playerSpawnSize 1000
@ setting playerMaxCells 64
@ setting pelletCount 40000
@ setting listenerMaxConnectionsPerIP -1
@ save
```
*(Luego haz un `pm2 restart sig-server` para limpiar el mapa).*
