# Guía de Despliegue en Oracle Cloud - Sigmally Server

Esta guía detalla los pasos para poner en marcha el servidor de Sigmally en una instancia de Oracle Cloud (Ubuntu/Debian) con acceso SSH.

---

## 1. Preparación de la Máquina (SSH)

Conéctate a tu instancia y ejecuta los siguientes comandos para instalar las dependencias necesarias:

```bash
# Actualizar repositorios e instalar herramientas de compilación (necesario para ccore)
sudo apt update
sudo apt install -y build-essential python3 nodejs npm

# Instalar pnpm (recomendado para gestionar dependencias)
sudo npm install -g pnpm

# Instalar PM2 (para que el servidor no se apague al cerrar la terminal)
sudo npm install -g pm2
```

---

## 2. Instalación del Servidor

Sube tu carpeta del proyecto al servidor o clónala. Una vez dentro de la carpeta `sig-server`:

```bash
# Instalar las dependencias del proyecto (compilará el módulo C++ corregido)
pnpm install

# Verificar que el archivo settings.json existe y tiene el puerto deseado
# Si no existe, puedes crearlo con:
# echo '{"listeningPort": 3000}' > settings.json
```

---

## 3. Apertura de Puertos ( Firewall de Linux )

Oracle Cloud tiene un firewall interno muy estricto. Debes abrir el puerto (ejemplo: 3000) en el sistema operativo:

```bash
# Abrir el puerto 3000 en el firewall de Ubuntu
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT

# Guardar los cambios para que persistan tras reiniciar
sudo netfilter-persistent save
```

---

## 4. Configuración en el Panel de Oracle ( Web )

Debes permitir el tráfico hacia el puerto 3000 desde la consola de Oracle Cloud:

1. Ve a **Compute** -> **Instances** -> Haz clic en tu instancia.
2. En **Instance Details**, haz clic en la **Subnet** (Subred).
3. Haz clic en la **Default Security List** (Lista de seguridad).
4. Haz clic en **Add Ingress Rules** (Agregar regla de entrada).
5. Configura la regla:
   - **Source Type:** CIDR
   - **Source CIDR:** `0.0.0.0/0`
   - **IP Protocol:** `TCP`
   - **Destination Port Range:** `3000`
   - **Description:** Sigmally Server
6. Haz clic en **Add Ingress Rules**.

---

## 5. Ejecución Permanente con PM2

Para que el servidor funcione 24/7 y puedas usar la consola interactiva:

```bash
# Arrancar el servidor con PM2
pm2 start cli/index.js --name "sig-server"

# --- COMANDOS ÚTILES DE PM2 ---

# Ver la consola interactiva (donde escribes @ setting...)
pm2 attach sig-server

# Ver logs en tiempo real
pm2 logs sig-server

# Reiniciar o detener
pm2 restart sig-server
pm2 stop sig-server
```

---

## 6. Cómo Conectar

Comparte tu **IP Pública** con tus amigos. Pueden entrar usando estos enlaces:

- **Sigmally Fixes:** `https://one.sigmally.com?ip=ws://TU_IP_PUBLICA:3000/sigmally.com`
- **Delta:** Poner `ws://TU_IP_PUBLICA:3000/sigmally.com` en el cuadro de IP del cliente.

---

*Nota: Si prefieres usar el puerto 80, recuerda cambiar el puerto en `settings.json` y repetir los pasos de apertura de puertos para el puerto 80.*
