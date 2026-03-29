const express = require('express');
const { exec } = require('child_process');
const bodyParser = require('body-parser');
const net = require('net');
const app = express();

// --- CONFIGURACIÓN ---
const PORT = 4000;
const SIG_SERVER_ID = 3;
const SOCKET_PATH = '/tmp/sigserver.sock';
// ---------------------

app.use(bodyParser.urlencoded({ extended: true }));

// Función para enviar comandos al servidor a través del puente (Sin reiniciar)
function sendCommand(cmd) {
    const client = net.createConnection({ path: SOCKET_PATH }, () => {
        client.write(cmd);
        client.end();
    });
    client.on('error', (err) => console.error("Error conectando al puente:", err.message));
}

// HTML del Panel
const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Sigmally Control Panel</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: sans-serif; background: #1a1a1a; color: white; padding: 20px; }
        .card { background: #2a2a2a; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
        input, select, button { padding: 10px; margin: 5px 0; border-radius: 4px; border: 1px solid #444; width: 100%; box-sizing: border-box; }
        button { background: #007bff; color: white; font-weight: bold; cursor: pointer; border: none; }
        button:hover { background: #0056b3; }
        button.danger { background: #dc3545; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        pre { background: black; padding: 10px; border-radius: 4px; overflow-x: auto; color: #0f0; font-size: 12px; }
    </style>
</head>
<body>
    <h1>Sigmally Dashboard 🚀</h1>
    
    <div class="card">
        <h3>Acciones Rápidas (Al vuelo)</h3>
        <div class="grid">
            <form method="POST" action="/cmd"><input type="hidden" name="c" value="addbot 0 10"><button>+10 Bots</button></form>
            <form method="POST" action="/cmd"><input type="hidden" name="c" value="stats"><button>Ver Stats</button></form>
            <form method="POST" action="/cmd"><input type="hidden" name="c" value="players"><button>Ver Jugadores</button></form>
            <form method="POST" action="/cmd"><input type="hidden" name="c" value="save"><button>Guardar a settings.json</button></form>
        </div>
    </div>

    <div class="card">
        <h3>Ajustes (Sin reiniciar partida)</h3>
        <form method="POST" action="/setting">
            <select name="s">
                <option value="playerMoveMult">Velocidad (playerMoveMult)</option>
                <option value="playerSpawnSize">Masa Inicial (playerSpawnSize)</option>
                <option value="pelletCount">Comida (pelletCount)</option>
                <option value="listenerMaxConnectionsPerIP">Límite IPs (-1 = off)</option>
                <option value="chatEnabled">Chat (true/false)</option>
            </select>
            <input type="text" name="v" placeholder="Valor (ej: 10 o -1)" required>
            <button>Cambiar al instante</button>
        </form>
    </div>

    <div class="card">
        <h3>Comando Manual</h3>
        <form method="POST" action="/cmd">
            <input type="text" name="c" placeholder="Escribe el comando (ej: mass 1 5000)" required>
            <button>Enviar Comando</button>
        </form>
    </div>

    <div class="card">
        <h3>Logs del Servidor</h3>
        <pre id="logs">Cargando logs...</pre>
    </div>

    <script>
        setInterval(() => {
            fetch('/getlogs').then(r => r.text()).then(t => document.getElementById('logs').innerText = t);
        }, 2000);
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(html));

app.post('/cmd', (req, res) => {
    sendCommand(req.body.c);
    res.redirect('/');
});

app.post('/setting', (req, res) => {
    const { s, v } = req.body;
    sendCommand(`setting ${s} ${v}`);
    res.redirect('/');
});

app.get('/getlogs', (req, res) => {
    exec(`pm2 logs ${SIG_SERVER_ID} --raw --lines 20`, (err, stdout) => res.send(stdout));
});

app.listen(PORT, () => console.log(`Panel de control en puerto ${PORT}`));
