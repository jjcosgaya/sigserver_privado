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

console.log(">> Dashboard Extreme v2 iniciando...");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'sigmally-secret-ultra-v4',
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
    console.log(">> Enviando comando al puente:", cmd);
    const client = net.createConnection({ path: SOCKET_PATH }, () => {
        client.write(cmd);
        client.end();
    });
    client.on('error', (err) => {
        console.error(">> [ERROR] No se pudo conectar al puente (socket):", err.message);
    });
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
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Sigmally Extreme Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            :root { --bg: #0f0f13; --card: #1a1a24; --accent: #007bff; --success: #28a745; --danger: #dc3545; }
            body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: #e0e0e0; margin: 0; display: flex; flex-direction: column; height: 100vh; }
            .navbar { background: var(--card); padding: 10px 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; }
            .container { display: grid; grid-template-columns: 1fr 320px; gap: 20px; padding: 20px; flex: 1; overflow: hidden; }
            @media (max-width: 900px) { .container { grid-template-columns: 1fr; overflow-y: auto; } }
            .main-panel { overflow-y: auto; padding-right: 10px; }
            .card { background: var(--card); padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #2d2d3d; }
            h3 { margin-top: 0; color: var(--accent); font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
            button { background: var(--accent); color: white; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: 0.1s; }
            button:active { transform: scale(0.95); }
            select, input { background: #0f0f13; color: white; border: 1px solid #333; padding: 12px; border-radius: 6px; outline: none; }
            .terminal { background: #000; padding: 15px; border-radius: 8px; font-family: monospace; color: #00ff00; height: 350px; overflow-y: auto; font-size: 13px; border: 1px solid #333; white-space: pre-wrap; }
            .val-badge { background: #333; padding: 2px 8px; border-radius: 4px; color: #f39c12; font-family: monospace; font-weight: bold; font-size: 14px; }
            .cheatsheet { font-size: 12px; color: #aaa; }
            .cheatsheet code { color: #00ff00; }
        </style>
    </head>
    <body>
        <div class="navbar">
            <h2 style="margin:0;">SIGMALLY <span style="color:var(--accent)">EXTREME</span></h2>
            <div style="display:flex; gap:10px;">
                <button onclick="loadData()" style="background:#444;">🔄 Refrescar Datos</button>
                <a href="/logout"><button style="background:var(--danger)">Cerrar</button></a>
            </div>
        </div>

        <div class="container">
            <div class="main-panel">
                <div class="card">
                    <h3>⚡ Comandos Rápidos</h3>
                    <div class="grid">
                        <button onclick="run('stats')">📊 Stats</button>
                        <button onclick="run('players')">👥 Jugadores</button>
                        <button onclick="run('addbot 0 20')">🤖 +20 Bots</button>
                        <button onclick="run('rmbot 0 20')">🚫 -20 Bots</button>
                        <button onclick="run('restart')" style="background:#f39c12">🔄 Reset Mapa</button>
                        <button onclick="run('reload')" style="background:#6f42c1">📁 Recargar JSON</button>
                    </div>
                </div>

                <div class="card">
                    <h3>🛠️ Configuración Global</h3>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px;">
                        <div>
                            <label style="font-size:11px; color:#888;">CATEGORÍA</label>
                            <select id="cat" onchange="updateSettingsList()" style="width:100%;">
                                <option value="move">🏃 Movimiento</option>
                                <option value="mass">⚖️ Masa y Divisiones</option>
                                <option value="food">🍎 Comida y Virus</option>
                                <option value="world">🗺️ Mapa y Mundo</option>
                                <option value="security">🛡️ Seguridad y Red</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:11px; color:#888;">AJUSTE</label>
                            <select id="set_name" onchange="showCurrentValue()" style="width:100%;"></select>
                        </div>
                    </div>
                    <div style="background:#000; padding:15px; border-radius:8px; display:flex; align-items:center; justify-content:space-between;">
                        <div>
                            <span style="font-size:12px; color:#888;">Valor Actual:</span><br>
                            <span id="curr_val" class="val-badge">...</span>
                        </div>
                        <div style="display:flex; gap:10px; width:60%;">
                            <input type="text" id="set_val" placeholder="Nuevo valor" style="flex:1;">
                            <button onclick="set()" style="width:100px; background:var(--success)">APLICAR</button>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <h3>💻 Consola Manual</h3>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="manual_cmd" placeholder="Comando libre (ej: mass 1 10000)" style="flex:1; font-family:monospace;">
                        <button onclick="run_manual()" style="width:100px; background:#444;">ENVIAR</button>
                    </div>
                </div>

                <div class="card">
                    <h3>📺 Consola en Vivo</h3>
                    <div id="logs" class="terminal">Conectando con el servidor...</div>
                </div>
            </div>

            <div class="side-panel">
                <div class="card cheatsheet">
                    <h3>📖 Cheatsheet</h3>
                    <p><b>Jugadores:</b><br>
                    <code>mass ID MASA</code><br>
                    <code>kill ID</code><br>
                    <code>merge ID</code><br>
                    <code>explode ID</code></p>
                    <p><b>Bots:</b><br>
                    <code>addbot 0 CANT</code><br>
                    <code>addminion ID CANT</code></p>
                    <p><b>Baneos:</b><br>
                    <code>forbid ID_o_IP</code><br>
                    <code>pardon IP</code></p>
                    <hr style="border:0; border-top:1px solid #333;">
                    <p style="color:var(--accent)"><b>Tip:</b> Los cambios se aplican al instante y se guardan en el archivo.</p>
                </div>
            </div>
        </div>

        <script>
            let serverSettings = {};
            const configMap = {
                move: [
                    {n: 'playerMoveMult', d: 'Velocidad Jugadores'},
                    {n: 'playerDecayMult', d: 'Velocidad Pérdida Masa'},
                    {n: 'playerMergeTime', d: 'Tiempo para Re-juntarse'},
                    {n: 'playerSplitBoost', d: 'Fuerza de Salto (Espacio)'},
                    {n: 'playerNoCollideDelay', d: 'Delay Colisión Propia'}
                ],
                mass: [
                    {n: 'playerSpawnSize', d: 'Masa al Nacer'},
                    {n: 'playerMaxSize', d: 'Masa Máx Celda'},
                    {n: 'playerMaxCells', d: 'Límite Divisiones'},
                    {n: 'playerMinSplitSize', d: 'Masa Mín para Dividirse'},
                    {n: 'playerMinEjectSize', d: 'Masa Mín para tirar W'}
                ],
                food: [
                    {n: 'pelletCount', d: 'Cantidad de Comida'},
                    {n: 'pelletMinSize', d: 'Tamaño Bolitas'},
                    {n: 'virusMinCount', d: 'Cantidad Virus'},
                    {n: 'virusSize', d: 'Tamaño Virus'},
                    {n: 'ejectedSize', d: 'Masa de la W'},
                    {n: 'ejectedCellBoost', d: 'Velocidad de la W'}
                ],
                world: [
                    {n: 'worldMapW', d: 'Ancho del Mapa'},
                    {n: 'worldMapH', d: 'Alto del Mapa'},
                    {n: 'worldPlayerBotsPerWorld', d: 'Bots Automáticos'},
                    {n: 'serverFrequency', d: 'Ticks por Seg (Smooth)'}
                ],
                security: [
                    {n: 'listenerMaxConnectionsPerIP', d: 'Límite IPs (-1 off)'},
                    {n: 'listenerMaxConnections', d: 'Máx Jugadores'},
                    {n: 'chatEnabled', d: 'Habilitar Chat'},
                    {n: 'chatCooldown', d: 'Cooldown Chat (ms)'}
                ]
            };

            async function loadData() {
                try {
                    const r = await fetch('/getallsettings');
                    serverSettings = await r.json();
                    updateSettingsList();
                } catch(e) { console.error("Error cargando settings:", e); }
            }

            function updateSettingsList() {
                const cat = document.getElementById('cat').value;
                const sel = document.getElementById('set_name');
                sel.innerHTML = configMap[cat].map(s => `<option value="${s.n}">${s.d}</option>`).join('');
                showCurrentValue();
            }

            function showCurrentValue() {
                const name = document.getElementById('set_name').value;
                const val = serverSettings[name];
                document.getElementById('curr_val').innerText = (val === undefined) ? '?' : val;
            }

            function run(c) { fetch('/cmd?c='+encodeURIComponent(c)); }
            
            function run_manual() { 
                const i = document.getElementById('manual_cmd');
                if(i.value) { run(i.value); i.value = ''; }
            }

            async function set() {
                const n = document.getElementById('set_name').value;
                const v = document.getElementById('set_val').value;
                if(!v) return;
                await fetch('/update_setting?n='+n+'&v='+encodeURIComponent(v));
                document.getElementById('set_val').value = '';
                setTimeout(loadData, 500); 
            }

            loadData();

            setInterval(() => {
                fetch('/getlogs').then(r => r.text()).then(t => {
                    const l = document.getElementById('logs');
                    const wasAtBottom = l.scrollHeight - l.clientHeight <= l.scrollTop + 50;
                    l.innerText = t;
                    if (wasAtBottom) l.scrollTop = l.scrollHeight;
                }).catch(e => {
                    document.getElementById('logs').innerText = ">> [ERROR] No se puede conectar con el Dashboard API.";
                });
            }, 2000);
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

app.get('/update_setting', auth, (req, res) => {
    const { n, v } = req.query;
    if (!n || !v) return res.sendStatus(400);
    sendCommand(`setting ${n} ${v}`);
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
        if (!proc) return res.send(">> [ERROR] sig-server no encontrado.");
        
        const logPath = proc.pm2_env.pm_out_log_path;
        exec(`tail -n 100 "${logPath}"`, (err, stdout) => {
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

app.listen(PORT, () => console.log(`Dashboard activo en puerto ${PORT}`));
