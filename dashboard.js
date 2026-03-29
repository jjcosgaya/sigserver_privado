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
    secret: 'sigmally-secret-ultra',
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
    client.on('error', (err) => console.error("Error puente:", err.message));
}

const auth = (req, res, next) => {
    if (req.session.authenticated) next();
    else res.send(`
        <body style="background:#0f0f13;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;margin:0;">
            <form method="POST" action="/login" style="background:#1a1a24;padding:40px;border-radius:15px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.5);border:1px solid #333;">
                <h1 style="margin-top:0;color:#007bff;">🚀 Sigmally Admin</h1>
                <p style="color:#888;">Introduce la clave maestra</p>
                <input type="password" name="pass" placeholder="Contraseña" autofocus style="padding:12px;width:250px;border-radius:6px;border:1px solid #333;background:#0f0f13;color:white;outline:none;text-align:center;"><br><br>
                <button style="padding:12px 30px;background:#007bff;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:bold;width:100%;">DESBLOQUEAR</button>
            </form>
        </body>
    `);
};

app.post('/login', (req, res) => {
    if (req.body.pass === PASSWORD) {
        req.session.authenticated = true;
        res.redirect('/');
    } else res.send("<body style='background:#0f0f13;color:red;text-align:center;padding-top:50px;font-family:sans-serif;'><h2>Acceso Denegado</h2><a href='/' style='color:white;'>Reintentar</a></body>");
});

app.get('/', auth, (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Sigmally Pro Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            :root { --bg: #0f0f13; --card: #1a1a24; --accent: #007bff; --success: #28a745; --danger: #dc3545; }
            body { font-family: 'Segoe UI', sans-serif; background: var(--bg); color: #e0e0e0; margin: 0; display: flex; flex-direction: column; height: 100vh; }
            
            /* Layout */
            .navbar { background: var(--card); padding: 10px 25px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; }
            .container { display: grid; grid-template-columns: 1fr 350px; gap: 20px; padding: 20px; flex: 1; overflow: hidden; }
            @media (max-width: 900px) { .container { grid-template-columns: 1fr; overflow-y: auto; } }
            
            /* Componentes */
            .main-panel { overflow-y: auto; padding-right: 10px; }
            .card { background: var(--card); padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #2d2d3d; }
            h3 { margin-top: 0; color: var(--accent); font-size: 16px; text-transform: uppercase; letter-spacing: 1px; }
            
            /* Botones y Formas */
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
            button { background: var(--accent); color: white; padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: 0.2s; }
            button:hover { filter: brightness(1.2); transform: translateY(-1px); }
            select, input { background: #0f0f13; color: white; border: 1px solid #333; padding: 10px; border-radius: 6px; outline: none; }
            
            /* Terminal */
            .terminal { background: #000; padding: 15px; border-radius: 8px; font-family: 'Consolas', monospace; color: #00ff00; height: 350px; overflow-y: auto; font-size: 13px; border: 1px solid #333; line-height: 1.5; }
            .log-line { border-bottom: 1px solid #111; padding: 2px 0; }
            
            /* Cheatsheet */
            .cheatsheet { font-size: 13px; color: #aaa; }
            .cheatsheet code { color: var(--accent); background: #000; padding: 2px 5px; border-radius: 3px; }
            .status-tag { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: var(--success); color: white; }
        </style>
    </head>
    <body>
        <div class="navbar">
            <div style="display:flex; align-items:center; gap:15px;">
                <h2 style="margin:0;">SIGMALLY <span style="color:var(--accent)">PRO</span></h2>
                <span class="status-tag">SERVER ONLINE</span>
            </div>
            <a href="/logout" style="text-decoration:none;"><button style="background:#333; font-size:12px;">Cerrar Sesión</button></a>
        </div>

        <div class="container">
            <!-- COLUMNA IZQUIERDA: CONTROLES -->
            <div class="main-panel">
                
                <div class="card">
                    <h3>⚡ Acciones de Control</h3>
                    <div class="grid">
                        <button onclick="run('stats')">📊 Estadísticas</button>
                        <button onclick="run('players')">👥 Ver Jugadores</button>
                        <button onclick="run('addbot 0 20')">🤖 +20 Bots</button>
                        <button onclick="run('killall 0')" style="background:var(--danger)">💀 Matar Todos</button>
                        <button onclick="run('restart')" style="background:#f39c12">🔄 Reiniciar Mapa</button>
                        <button onclick="run('save')" style="background:var(--success)">💾 Guardar Cambios</button>
                    </div>
                </div>

                <div class="card">
                    <h3>🛠️ Configuración Rápida</h3>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                        <div>
                            <label style="display:block; margin-bottom:5px; font-size:12px;">Categoría</label>
                            <select id="cat" onchange="updateSettingsList()" style="width:100%;">
                                <option value="move">🏃 Movimiento y Velocidad</option>
                                <option value="mass">⚖️ Masa y Tamaño</option>
                                <option value="food">🍎 Comida y Virus</option>
                                <option value="server">🌐 Servidor y Red</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block; margin-bottom:5px; font-size:12px;">Ajuste</label>
                            <select id="set_name" style="width:100%;"></select>
                        </div>
                    </div>
                    <div style="margin-top:15px; display:flex; gap:10px;">
                        <input type="text" id="set_val" placeholder="Nuevo valor (ej: 10)" style="flex:1;">
                        <button onclick="set()" style="width:150px;">APLICAR</button>
                    </div>
                </div>

                <div class="card">
                    <h3>💻 Consola Manual</h3>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="manual_cmd" placeholder="Escribe un comando... (ej: mass 1 5000)" style="flex:1; font-family:monospace;">
                        <button onclick="run_manual()" style="width:120px; background:#444;">ENVIAR</button>
                    </div>
                </div>

                <div class="card">
                    <h3>📺 Salida en Tiempo Real</h3>
                    <div id="logs" class="terminal">Cargando consola...</div>
                </div>
            </div>

            <!-- COLUMNA DERECHA: GUÍA -->
            <div class="side-panel">
                <div class="card cheatsheet">
                    <h3>📖 Guía de Comandos</h3>
                    <p><b>Gestión de Jugadores:</b></p>
                    <ul>
                        <li><code>mass ID VAL</code>: Dar masa</li>
                        <li><code>kill ID</code>: Matar</li>
                        <li><code>merge ID</code>: Juntar piezas</li>
                        <li><code>addminion ID CANT</code>: Dar minions</li>
                    </ul>
                    <p><b>Bots y Mundo:</b></p>
                    <ul>
                        <li><code>addbot 0 CANT</code>: Añadir bots</li>
                        <li><code>rmbot 0 CANT</code>: Quitar bots</li>
                    </ul>
                    <hr style="border:0; border-top:1px solid #333; margin:15px 0;">
                    <p><b>Ajustes Pro:</b></p>
                    <small>
                        - <b>playerMoveMult:</b> Velocidad base (2.5 normal, 10 rápido)<br>
                        - <b>playerMaxCells:</b> Div máx (16 normal, 64 pro)<br>
                        - <b>pelletCount:</b> Cant. comida (20000 normal)
                    </small>
                </div>
            </div>
        </div>

        <script>
            const settings = {
                move: [
                    {n: 'playerMoveMult', d: 'Velocidad Jugadores'},
                    {n: 'playerDecayMult', d: 'Pérdida de masa (0.001 lento)'},
                    {n: 'playerMergeTime', d: 'Tiempo para juntarse (seg)'}
                ],
                mass: [
                    {n: 'playerSpawnSize', d: 'Masa Inicial'},
                    {n: 'playerMaxSize', d: 'Masa Máxima Celda'},
                    {n: 'playerMinSplitSize', d: 'Masa mín para dividirse'}
                ],
                food: [
                    {n: 'pelletCount', d: 'Cantidad de Comida'},
                    {n: 'pelletMinSize', d: 'Masa mín comida'},
                    {n: 'virusMinCount', d: 'Cantidad mín de Virus'},
                    {n: 'ejectedSize', d: 'Masa de la W'}
                ],
                server: [
                    {n: 'listenerMaxConnectionsPerIP', d: 'Límite IPs (-1 off)'},
                    {n: 'serverName', d: 'Nombre Servidor'},
                    {n: 'chatEnabled', d: 'Habilitar Chat (true/false)'}
                ]
            };

            function updateSettingsList() {
                const cat = document.getElementById('cat').value;
                const sel = document.getElementById('set_name');
                sel.innerHTML = settings[cat].map(s => \`<option value="\${s.n}">\${s.d}</option>\`).join('');
            }

            function run(c) { fetch('/cmd?c='+encodeURIComponent(c)); }
            function run_manual() { 
                const i = document.getElementById('manual_cmd');
                if(i.value) { run(i.value); i.value = ''; }
            }
            function set() {
                const n = document.getElementById('set_name').value;
                const v = document.getElementById('set_val').value;
                if(v) { run('setting ' + n + ' ' + v); document.getElementById('set_val').value = ''; }
            }

            // Inicializar lista
            updateSettingsList();

            // Logs
            setInterval(() => {
                fetch('/getlogs').then(r => r.text()).then(t => {
                    const l = document.getElementById('logs');
                    const isAtBottom = l.scrollHeight - l.clientHeight <= l.scrollTop + 50;
                    l.innerText = t;
                    if (isAtBottom) l.scrollTop = l.scrollHeight;
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
    if (!id) return res.send(">> [ERROR] No se encuentra el proceso 'sig-server' en PM2.");
    exec(`pm2 logs ${id} --raw --lines 100 --no-append`, (err, stdout) => res.send(stdout));
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(PORT, () => console.log(`Dashboard Pro activo en puerto ${PORT}`));
