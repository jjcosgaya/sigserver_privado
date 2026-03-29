const express = require('express');
const { exec, execSync } = require('child_process');
const bodyParser = require('body-parser');
const session = require('express-session');
const net = require('net');
const fs = require('fs');
const app = express();

// --- CONFIGURACIÓN ---
const PORT = 4000;
const PASSWORD = "admin"; 
const SOCKET_PATH = '/tmp/sigserver.sock';
const SETTINGS_FILE = './settings.json';
// ---------------------

console.log(">> Dashboard Extreme v3 (List View) iniciando...");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'sigmally-secret-ultra-vlist',
    resave: false,
    saveUninitialized: true
}));

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
    client.on('error', (err) => console.error(">> [ERROR] Puente offline"));
}

const auth = (req, res, next) => {
    if (req.session.authenticated) next();
    else res.send(`
        <body style="background:#0f0f13;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;margin:0;">
            <form method="POST" action="/login" style="background:#1a1a24;padding:40px;border-radius:15px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.5);border:1px solid #333;">
                <h1 style="margin-top:0;color:#007bff;">🚀 Sigmally Admin</h1>
                <input type="password" name="pass" placeholder="Contraseña" autofocus style="padding:12px;width:250px;border-radius:6px;border:1px solid #333;background:#0f0f13;color:white;outline:none;text-align:center;"><br><br>
                <button style="padding:12px 30px;background:#007bff;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;width:100%;">ENTRAR</button>
            </form>
        </body>
    `);
};

app.post('/login', (req, res) => {
    if (req.body.pass === PASSWORD) {
        req.session.authenticated = true;
        res.redirect('/');
    } else res.send("Error. <a href='/'>Reintentar</a>");
});

app.get('/getallsettings', auth, (req, res) => {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            res.json(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')));
        } else res.json({});
    } catch(e) { res.json({error: e.message}); }
});

app.get('/', auth, (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Sigmally Extreme Dashboard v3</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            :root { --bg: #0f0f13; --card: #1a1a24; --accent: #007bff; --success: #28a745; --danger: #dc3545; }
            body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: #e0e0e0; margin: 0; display: flex; flex-direction: column; height: 100vh; }
            .navbar { background: var(--card); padding: 10px 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; position: sticky; top: 0; z-index: 100; }
            .container { display: grid; grid-template-columns: 1fr 350px; gap: 20px; padding: 20px; flex: 1; overflow: hidden; }
            @media (max-width: 1100px) { .container { grid-template-columns: 1fr; overflow-y: auto; } }
            .main-panel { overflow-y: auto; padding-right: 10px; }
            .card { background: var(--card); padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #2d2d3d; }
            h3 { margin-top: 0; color: var(--accent); font-size: 14px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
            .settings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; }
            .setting-item { background: #0f0f13; padding: 12px; border-radius: 8px; border: 1px solid #222; }
            .setting-label { font-size: 12px; color: #888; display: block; margin-bottom: 5px; }
            .setting-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .setting-name { font-weight: 600; font-size: 14px; color: #ccc; }
            .val-badge { background: #222; padding: 2px 6px; border-radius: 4px; color: #f39c12; font-family: monospace; font-size: 12px; }
            .setting-input-group { display: flex; gap: 5px; }
            .setting-input-group input { flex: 1; background: #1a1a24; border: 1px solid #333; color: white; padding: 6px 10px; border-radius: 4px; font-size: 13px; }
            .setting-input-group button { background: var(--accent); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; }
            .terminal { background: #000; padding: 15px; border-radius: 8px; font-family: monospace; color: #00ff00; height: 300px; overflow-y: auto; font-size: 12px; border: 1px solid #333; white-space: pre-wrap; }
            .action-buttons { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
            .action-buttons button { padding: 8px 15px; font-size: 12px; }
            .side-panel { display: flex; flex-direction: column; gap: 20px; }
            .category-title { font-size: 18px; font-weight: bold; color: white; margin: 25px 0 15px 0; display: flex; align-items: center; gap: 10px; }
            .category-title:first-child { margin-top: 0; }
            input:focus { border-color: var(--accent); }
            ::-webkit-scrollbar { width: 8px; }
            ::-webkit-scrollbar-track { background: #0f0f13; }
            ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
            ::-webkit-scrollbar-thumb:hover { background: #444; }
        </style>
    </head>
    <body>
        <div class="navbar">
            <h2 style="margin:0;">SIGMALLY <span style="color:var(--accent)">ADMIN PRO</span></h2>
            <div style="display:flex; gap:10px;">
                <button onclick="loadData()" style="background:#444;">🔄 Sincronizar</button>
                <a href="/logout"><button style="background:var(--danger)">Cerrar</button></a>
            </div>
        </div>

        <div class="container">
            <div class="main-panel">
                <div class="card">
                    <h3>⚡ Acciones Rápidas</h3>
                    <div class="action-buttons">
                        <button onclick="run('stats')">📊 Stats</button>
                        <button onclick="run('players')">👥 Jugadores</button>
                        <button onclick="run('addbot 0 20')">🤖 +20 Bots</button>
                        <button onclick="run('rmbot 0 20')">🚫 -20 Bots</button>
                        <button onclick="run('restart')" style="background:#f39c12">🔄 Reset Mapa</button>
                        <button onclick="run('reload')" style="background:#6f42c1">📁 Recargar JSON</button>
                    </div>
                </div>

                <div id="settings-container">
                    <!-- Las categorías se cargarán aquí -->
                </div>
            </div>

            <div class="side-panel">
                <div class="card">
                    <h3>💻 Consola Manual</h3>
                    <input type="text" id="manual_cmd" placeholder="ej: mass 1 10000" style="width:100%; margin-bottom:10px; background:#000; border:1px solid #333; padding:10px; color:white; border-radius:6px; font-family:monospace;">
                    <button onclick="run_manual()" style="width:100%; background:#444;">ENVIAR COMANDO</button>
                </div>

                <div class="card" style="flex:1; display:flex; flex-direction:column;">
                    <h3>📺 Consola del Servidor</h3>
                    <div id="logs" class="terminal" style="flex:1;">Iniciando terminal...</div>
                </div>
            </div>
        </div>

        <script>
            let serverSettings = {};
            const sections = [
                {
                    title: "🏃 Movimiento y Física",
                    settings: [
                        {n: 'playerMoveMult', d: 'Velocidad Jugadores'},
                        {n: 'playerDecayMult', d: 'Pérdida de masa (Decay)'},
                        {n: 'playerMergeTime', d: 'Tiempo para Re-juntarse'},
                        {n: 'playerSplitBoost', d: 'Fuerza de Salto (Espacio)'},
                        {n: 'playerNoCollideDelay', d: 'Delay Colisión Propia'}
                    ]
                },
                {
                    title: "⚖️ Masa y Autosplit",
                    settings: [
                        {n: 'playerSpawnSize', d: 'Masa al Nacer'},
                        {n: 'playerMaxSize', d: 'Límite Autosplit (Masa Máx)'},
                        {n: 'playerMaxCells', d: 'Límite Divisiones (Celdas)'},
                        {n: 'playerMinSplitSize', d: 'Masa Mínima para Dividirse'},
                        {n: 'playerMinEjectSize', d: 'Masa Mínima para tirar W'}
                    ]
                },
                {
                    title: "🍎 Comida y Virus",
                    settings: [
                        {n: 'pelletCount', d: 'Cantidad de Comida'},
                        {n: 'pelletMinSize', d: 'Tamaño Bolitas'},
                        {n: 'virusMinCount', d: 'Cantidad de Virus'},
                        {n: 'virusSize', d: 'Tamaño Virus'},
                        {n: 'ejectedSize', d: 'Masa de la W'},
                        {n: 'ejectedCellBoost', d: 'Velocidad de la W'}
                    ]
                },
                {
                    title: "🗺️ Mapa y Configuración",
                    settings: [
                        {n: 'worldMapW', d: 'Ancho del Mapa'},
                        {n: 'worldMapH', d: 'Alto del Mapa'},
                        {n: 'worldPlayerBotsPerWorld', d: 'Bots Automáticos'},
                        {n: 'serverFrequency', d: 'Smoothness (Server Ticks)'}
                    ]
                },
                {
                    title: "🛡️ Seguridad y Chat",
                    settings: [
                        {n: 'listenerMaxConnectionsPerIP', d: 'Límite IPs (-1 off)'},
                        {n: 'listenerMaxConnections', d: 'Máx Jugadores'},
                        {n: 'chatEnabled', d: 'Habilitar Chat'},
                        {n: 'chatCooldown', d: 'Cooldown Chat (ms)'}
                    ]
                }
            ];

            async function loadData() {
                try {
                    const r = await fetch('/getallsettings');
                    serverSettings = await r.json();
                    renderSettings();
                } catch(e) { console.error("Error cargando settings:", e); }
            }

            function renderSettings() {
                const container = document.getElementById('settings-container');
                let html = '';
                
                sections.forEach(section => {
                    html += '<div class="category-title">' + section.title + '</div>';
                    html += '<div class="settings-grid">';
                    
                    section.settings.forEach(s => {
                        const currentVal = serverSettings[s.n] !== undefined ? serverSettings[s.n] : '?';
                        html += '<div class="setting-item">';
                        html += '  <span class="setting-label">' + s.d + '</span>';
                        html += '  <div class="setting-info">';
                        html += '    <span class="setting-name">' + s.n + '</span>';
                        html += '    <span class="val-badge" id="val_' + s.n + '">' + currentVal + '</span>';
                        html += '  </div>';
                        html += '  <div class="setting-input-group">';
                        html += '    <input type="text" id="input_' + s.n + '" placeholder="Nuevo valor...">';
                        html += '    <button onclick="updateSetting(\\'' + s.n + '\\')">APLICAR</button>';
                        html += '  </div>';
                        html += '</div>';
                    });
                    
                    html += '</div>';
                });
                
                container.innerHTML = html;
            }

            function run(c) { fetch('/cmd?c='+encodeURIComponent(c)); }
            
            function run_manual() { 
                const i = document.getElementById('manual_cmd');
                if(i.value) { run(i.value); i.value = ''; }
            }

            async function updateSetting(name) {
                const input = document.getElementById('input_' + name);
                const value = input.value;
                if(!value) return;
                
                const r = await fetch('/update_setting?n=' + name + '&v=' + encodeURIComponent(value));
                if(r.ok) {
                    input.value = '';
                    // Actualización visual rápida
                    document.getElementById('val_' + name).innerText = value;
                    // Sincronización real
                    setTimeout(loadData, 500);
                }
            }

            loadData();

            setInterval(() => {
                fetch('/getlogs').then(r => r.text()).then(t => {
                    const l = document.getElementById('logs');
                    const wasAtBottom = l.scrollHeight - l.clientHeight <= l.scrollTop + 50;
                    l.innerText = t;
                    if (wasAtBottom) l.scrollTop = l.scrollHeight;
                }).catch(e => {});
            }, 2000);
        </script>
    </body>
    </html>
    `);
});

app.get('/update_setting', auth, (req, res) => {
    const { n, v } = req.query;
    if (!n || !v) return res.sendStatus(400);
    sendCommand("setting " + n + " " + v);
    try {
        let settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        settings[n] = isNaN(v) ? (v === 'true' ? true : v === 'false' ? false : v) : parseFloat(v);
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 4));
        res.sendStatus(200);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.get('/cmd', auth, (req, res) => {
    const cmd = req.query.c;
    if (!cmd) return res.sendStatus(400);
    if (cmd === 'restart') {
        exec('pm2 restart sig-server');
    } else {
        sendCommand(cmd);
    }
    res.sendStatus(200);
});

app.get('/getlogs', auth, (req, res) => {
    try {
        const data = JSON.parse(execSync('pm2 jlist').toString());
        const proc = data.find(p => p.name === 'sig-server');
        if (!proc) return res.send(">> [ERROR] sig-server no encontrado en PM2.");
        
        const logPath = proc.pm2_env.pm_out_log_path;
        if (!fs.existsSync(logPath)) return res.send(">> [ERROR] Archivo de log no encontrado.");
        
        exec('tail -n 100 "' + logPath + '"', (err, stdout) => {
            if (err) return res.send(">> [ERROR] tail failed: " + err.message);
            res.send(stdout || ">> Consola vacía.");
        });
    } catch (e) {
        res.send(">> [ERROR] Error leyendo logs: " + e.message);
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(PORT, () => console.log('Dashboard List View activo en puerto ' + PORT));
