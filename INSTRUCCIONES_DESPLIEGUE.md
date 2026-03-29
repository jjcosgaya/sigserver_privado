# Guía de Despliegue en Oracle Cloud - Sigmally Server

Esta guía detalla los pasos para poner en marcha el servidor de Sigmally en una instancia de Oracle Cloud (Ubuntu/Debian) con acceso SSH.

---

## 1. Preparación de la Máquina (SSH)

Conéctate a tu instancia y ejecuta los siguientes comandos para instalar las dependencias necesarias. **Es fundamental usar Node.js v20 o superior** para evitar errores de sintaxis moderna (`?.`).

```bash
# Instalar repositorio oficial de Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Actualizar e instalar herramientas de compilación y Node.js
sudo apt update
sudo apt install -y build-essential python3 nodejs npm

# Instalar pnpm (recomendado para gestionar dependencias)
sudo npm install -g pnpm

# Instalar PM2 (para gestión de procesos)
sudo npm install -g pm2
```

---

## 2. Instalación del Servidor

Sube tu carpeta del proyecto al servidor o clónala. Una vez dentro de la carpeta `sig-server`:

```bash
# Instalar las dependencias del proyecto (compilará el módulo C++ corregido)
pnpm install

# Instalar dependencias adicionales para el Dashboard
pnpm install express body-parser

# Verificar que el archivo settings.json tiene el puerto 3000
# echo '{"listeningPort": 3000}' > settings.json
```

---

## 3. Apertura de Puertos ( Firewall de Linux )

Oracle Cloud usa `iptables` por defecto. Debes abrir los puertos necesarios en el sistema operativo:

```bash
# Abrir puerto 3000 (juego), 4000 (dashboard), 80 (http) y 443 (https)
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 4000 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT

# Guardar los cambios para que persistan tras reiniciar
sudo netfilter-persistent save
```

---

## 4. Configuración en el Panel de Oracle ( Web )

Debes permitir el tráfico desde la consola de Oracle Cloud:

1. Ve a **Compute** -> **Instances** -> Haz clic en tu instancia.
2. En **Instance Details**, haz clic en la **Subnet** (Subred).
3. Haz clic en la **Default Security List** (Lista de seguridad).
4. Haz clic en **Add Ingress Rules** (Agregar regla de entrada).
5. Configura la regla:
   - **Source Type:** CIDR
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** `TCP`
   - **Destination Port Range:** `80, 443, 3000, 4000`
   - **Description:** Sigmally Server & Dashboard Ports
6. Haz clic en **Add Ingress Rules**.

---

## 5. Ejecución Permanente con PM2

Para que el servidor funcione 24/7 y puedas usar la consola interactiva:

```bash
# Arrancar el servidor de juego
pm2 start cli/index.js --name "sig-server"

# Arrancar el Panel de Control (Dashboard)
pm2 start dashboard.js --name "sig-dashboard"

# --- COMANDOS ÚTILES ---
pm2 status                  # Ver si los procesos están online (verde)
pm2 logs sig-server         # Ver errores si el servidor se cae
pm2 attach sig-server       # Entrar a la consola interactiva (@ setting...)
pm2 restart all             # Reiniciar todo el sistema
```

---

## 6. Uso del Panel de Control (Dashboard)

Una vez arrancado con PM2, puedes acceder al panel desde tu navegador:

- **URL:** `http://TU_IP_PUBLICA:4000`
- **Funciones en Tiempo Real (🚀):**
  - **Cambio de Ajustes:** La velocidad, masa inicial, etc., se aplican **al instante** sin reiniciar la partida y sin desconectar a nadie gracias al puente de sockets interno.
  - **Acciones Rápidas:** Botones para añadir bots o ver estadísticas "al vuelo".
  - **Botón Guardar:** Los cambios hechos desde el panel son temporales hasta que pulsas el botón "Guardar a settings.json".
  - **Logs en Vivo:** El panel muestra los últimos mensajes de la consola del servidor automáticamente.
- **Seguridad:** Recuerda editar la variable `PASSWORD` dentro de `dashboard.js` antes de lanzarlo.

---

## 7. Conexión Segura (WSS) con Cloudflare Tunnel

Si quieres usar `wss://` sin dominio propio y evitar errores de seguridad:

1. **Instalar cloudflared:**
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
```

2. **Crear el túnel con PM2:**
```bash
pm2 start "cloudflared tunnel --url http://localhost:3000" --name "tunnel"
```

3. **Obtener la URL segura:**
```bash
pm2 logs tunnel --lines 50 --no-append
```
Busca la URL que termina en `.trycloudflare.com`.

---

## 8. Cómo Conectar al Juego

Comparte la URL o la IP con tus amigos:

- **Opción Segura (wss):** 
  `https://one.sigmally.com?ip=wss://TU_URL_TRYCLOUDFLARE_COM/sigmally.com`
- **Opción Directa (ws):** 
  `https://one.sigmally.com?ip=ws://TU_IP_PUBLICA:3000/sigmally.com`

---

## 9. Solución de Problemas (Troubleshooting)

- **El Dashboard no carga:** Verifica que el puerto 4000 esté abierto en Oracle y en iptables (Pasos 3 y 4). Comprueba que el proceso esté verde en `pm2 status`.
- **Error de Sintaxis (`?.`):** Actualiza Node.js a la v20 (Paso 1).
- **El servidor de juego no responde al Dashboard:** Asegúrate de que el `SIG_SERVER_ID` en `dashboard.js` coincide con el ID que muestra `pm2 status`.
