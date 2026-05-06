# Guía de Despliegue en VPS — Sigmally Server

Guía genérica para desplegar el servidor de Sigmally en cualquier VPS (Ubuntu/Debian).  
**No necesitas abrir puertos** — usamos Cloudflare Tunnel o Tailscale Funnel para exponer los servicios.

---

## 1. Requisitos

- Node.js ≥ 20
- npm o pnpm
- PM2 (para gestión de procesos)
- `build-essential` y `python3` (para compilar el módulo C++)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt update
sudo apt install -y build-essential python3 nodejs
sudo npm install -g pm2 pnpm
```

---

## 2. Instalación del Servidor

Sube el proyecto al VPS (scp, rsync, git clone) y ejecuta:

```bash
cd sig-server
pnpm install
```

---

## 3. Ejecución Permanente con PM2

```bash
# Servidor de juego (puerto 3000)
pm2 start cli/index.js --name "sig-server"

# Consola administrativa (puerto 5000)
pm2 start console/index.js --name "sig-console"

# Guardar la configuración para que sobreviva a reinicios
pm2 save
pm2 startup
```

Comandos útiles:

```bash
pm2 status                  # Ver estado
pm2 logs sig-server         # Ver logs (también funciona con el id)
pm2 attach 0                # Consola interactiva (usa el id, ej: 0)
pm2 restart sig-server      # Reiniciar un proceso (o con el id)
pm2 restart all             # Reiniciar todo
```

Puedes usar nombre o id numérico indistintamente. Si no te funciona el nombre, saca el id con `pm2 id sig-server` o simplemente `pm2 status`.

### Usar los scripts `run.sh` y `run_tailscale.sh` con PM2

Los scripts `run.sh` (Cloudflare) y `run_tailscale.sh` (Tailscale) lanzan el servidor, la consola y el túnel/funnel automáticamente. Para ejecutarlos como proceso permanente con PM2:

```bash
pm2 start run.sh --interpreter bash --name "sig-server"
pm2 save
```

La parte interactiva del menú se redirigirá a los logs.

**Alternativa recomendada** — lanza cada componente por separado (tal como se explica arriba). Es más estable, puedes reiniciar cada pieza individualmente y los logs no se mezclan.

---

## 4. Exponer al Público (sin abrir puertos)

Elige una de las dos opciones según prefieras Cloudflare o Tailscale.

### Opción A: Cloudflare Tunnel (recomendado)

```bash
# Instalar cloudflared
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Túnel para el servidor de juego
pm2 start "cloudflared tunnel --url http://localhost:3000" --name "tunnel-game"

# Túnel para la consola
pm2 start "cloudflared tunnel --url http://localhost:5000" --name "tunnel-console"

# Obtener las URLs
pm2 logs tunnel-game --lines 50 --no-append
pm2 logs tunnel-console --lines 50 --no-append
```

Busca las líneas con `https://XXXXXXX.trycloudflare.com`.

### Opción B: Tailscale Funnel

Requiere Tailscale instalado y autenticado:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

(
Dentro de un contenedor:
```bash
tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state &
```
)

```bash
# Exponer servidor juego (puerto 443)
sudo tailscale funnel --bg 3000

# Exponer consola (puerto 8443)
sudo tailscale funnel --bg --https=8443 5000

# Ver URLs asignadas
tailscale funnel status

# Apagar el funnel (deja de exponer)
sudo tailscale funnel off
```

El script `run_tailscale.sh` incluido en el repositorio automatiza todo este proceso con un menú interactivo.

---

## 5. Cómo Conectar al Juego

Comparte el enlace correspondiente según el método que hayas elegido:

- **Cloudflare Tunnel:**
  `https://one.sigmally.com?ip=wss://TU_URL.trycloudflare.com/sigmally.com`

- **Tailscale Funnel:**
  `https://one.sigmally.com?ip=wss://TU_MACHINA.ts.net/sigmally.com`

- **Conexión local (mismo VPS):**
  `https://one.sigmally.com?ip=ws://localhost:3000/sigmally.com`

---

## 6. Consola de Administración

La consola corre en el puerto 5000. Una vez expuesta con Cloudflare o Tailscale, accede vía navegador.

- **Función:** cambiar ajustes en caliente (velocidad, masa inicial, etc.), añadir bots, ver estadísticas.
- **Seguridad:** edita la variable `CONSOLE_PASSWORD` en `console/index.js` antes de exponerla.

---

## 7. Solución de Problemas

| Problema | Causa / Solución |
|---|---|
| Error de sintaxis (`?.`) | Node.js < 20. Actualiza a v20. |
| El túnel no arranca | cloudflared desactualizado. Descarga la última versión. |
| Tailscale no conecta | Ejecuta `tailscale up` para autenticarte. |
| El servidor no responde | Revisa `pm2 logs sig-server`. |
| La consola no carga | Verifica que el proceso esté vivo con `pm2 status`. |
