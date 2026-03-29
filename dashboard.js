const express = require('express');
const { exec, execSync } = require('child_process');
const bodyParser = require('body-parser');
const session = require('express-session');
const net = require('net');
const fs = require('fs');
const app = express();

// --- CONFIGURACIÓN ---
const PORT = 4000;
const PASSWORD = "admin"; // CAMBIA TU CONTRASEÑA AQUÍ
const SOCKET_PATH = '/tmp/sigserver.sock';
// ---------------------

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'sigmally-secret',
    resave: false,
    saveUninitialized: true
}));

// Función para buscar el ID de PM2 automáticamente
function getSigServerId() {
    try {
        const data = JSON.parse(execSync('pm2 jlist').toString());
        const proc = data.find(p => p.name === 'sig-server');
        return proc ? proc.pm_id : null;
    } catch (e) { return null; }
}

function sendCommand(cmd) {
    const client = net.createConnection({ path: SOCKET_PATH }, () => {
        client.write(cmd);
        client.end();
    });
    client.on('error', (err) => console.error("Error puente:", err.message));
}

// Middleware de seguridad
const auth = (req, res, next) => {
    if (req.session.authenticated) next();
    else res.send(`
        <body style="background:#1a1a1a;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
            <form method="POST" action="/login" style="background:#2a2a2a;padding:30px;border-radius:8px;text-align:center;">
                <h2>Sigmally Admin</h2>
                <input type="password" name="pass" placeholder="Contraseña" style="padding:10px;width:200px;border-radius:4px;border:none;"><br><br>
                <button style="padding:10px 20px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">Entrar</button>
            </form>
        </body>
    `);
};

app.post('/login', (req, res) => {
    if (req.body.pass === PASSWORD) {
        req.session.authenticated = true;
        res.redirect('/');
    } else res.send("Contraseña incorrecta. <a href='/'>Volver</a>");
});

app.get('/', auth, (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Sigmally Dashboard 🚀</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: sans-serif; background: #1a1a1a; color: white; padding: 20px; }
            .card { background: #2a2a2a; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
            input, select, button { padding: 12px; margin: 5px 0; border-radius: 4px; border: 1px solid #444; width: 100%; box-sizing: border-box; }
            button { background: #007bff; color: white; font-weight: bold; cursor: pointer; border: none; transition: 0.2s; }
            button:hover { background: #0056b3; transform: translateY(-2px); }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
            pre { background: black; padding: 15px; border-radius: 4px; overflow-x: auto; color: #0f0; font-size: 13px; border: 1px solid #333; height: 300px; }
            .header { display: flex; justify-content: space-between; align-items: center; }
            .logout { background: #444; width: auto; padding: 5px 15px; font-size: 12px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Sigmally Dashboard 🚀</h1>
            <a href="/logout"><button class="logout">Cerrar Sesión</button></a>
        </div>
        
        <div class="card">
            <h3>Acciones Rápidas</h3>
            <div class="grid">
                <button onclick="run('addbot 0 10')">+10 Bots</button>
                <button onclick="run('stats')">Ver Stats</button>
                <button onclick="run('players')">Ver Jugadores</button>
                <button onclick="run('save')" style="background:#28a745;">Guardar Todo</button>
            </div>
        </div>

        <div class="card">
            <h3>Ajustes (En vivo)</h3>
            <div style="display:flex; gap:10px;">
                <select id="set_name" style="flex:2;">
                    <option value="playerMoveMult">Velocidad (playerMoveMult)</option>
                    <option value="playerSpawnSize">Masa Inicial (playerSpawnSize)</option>
                    <option value="pelletCount">Comida (pelletCount)</option>
                    <option value="listenerMaxConnectionsPerIP">Límite IPs (-1 = off)</option>
                </select>
                <input type="text" id="set_val" placeholder="Valor" style="flex:1;">
                <button onclick="set()" style="flex:1;">Aplicar</button>
            </div>
        </div>

        <div class="card">
            <h3>Consola Manual</h3>
            <div style="display:flex; gap:10px;">
                <input type="text" id="manual_cmd" placeholder="ej: mass 1 5000" style="flex:3;">
                <button onclick="run_manual()" style="flex:1;">Enviar</button>
            </div>
        </div>

        <div class="card">
            <h3>Consola del Servidor</h3>
            <pre id="logs">Conectando con el servidor...</pre>
        </div>

        <script>
            function run(c) { fetch('/cmd?c='+encodeURIComponent(c)); }
            function run_manual() { 
                const i = document.getElementById('manual_cmd');
                run(i.value); i.value = '';
            }
            function set() {
                const n = document.getElementById('set_name').value;
                const v = document.getElementById('set_val').value;
                run('setting ' + n + ' ' + v);
            }
            setInterval(() => {
                fetch('/getlogs').then(r => r.text()).then(t => {
                    const l = document.getElementById('logs');
                    l.innerText = t;
                    l.scrollTop = l.scrollHeight;
                });
            }, 2000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.get('/cmd', auth, (req, res) => {
    if (req.query.c) sendCommand(req.query.c);
    res.sendStatus(200);
});

app.get('/getlogs', auth, (req, res) => {
    const id = getSigServerId();
    if (!id) return res.send("Servidor no encontrado en PM2");
    exec(`pm2 logs ${id} --raw --lines 50 --no-append`, (err, stdout) => res.send(stdout));
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(PORT, () => console.log(`Panel de control en puerto ${PORT}`));
