const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const net = require('net');

const app = express();
const PORT = 5000;
const PASSWORD = process.env.CONSOLE_PASSWORD || "admin"; // Puedes cambiarla aquí
const SOCKET_PATH = '/tmp/sigserver.sock';
const SETTINGS_FILE = path.join(__dirname, '../settings.json');
const LOG_FILE = path.join(__dirname, '../logs/latest.log');
const TEMPLATES_DIR = path.join(__dirname, '../templates');

if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'sig-console-secret',
    resave: false,
    saveUninitialized: true
}));

// Middleware de autenticación
const auth = (req, res, next) => {
    if (req.session.authenticated) {
        next();
    } else {
        res.status(401).send('No autorizado');
    }
};

function sendCommand(cmd) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection({ path: SOCKET_PATH }, () => {
            client.write(cmd);
            client.end();
            resolve();
        });
        client.on('error', (err) => {
            console.error("Error enviando comando:", err.message);
            reject(err);
        });
    });
}

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', (req, res) => {
    if (req.body.password === PASSWORD) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
    }
});

app.get('/api/settings', auth, (req, res) => {
    try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
        res.json(settings);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/templates', auth, (req, res) => {
    try {
        const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json'));
        const templates = files.map(f => {
            const content = JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, f), 'utf-8'));
            return {
                id: f,
                name: content._template_name || f.replace('.json', ''),
                desc: content._template_desc || 'Sin descripción'
            };
        });
        res.json(templates);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/templates/save', auth, (req, res) => {
    try {
        const { id, name, desc, settings } = req.body;
        if (!id) return res.status(400).send('ID requerido');
        
        const fileName = id.endsWith('.json') ? id : `${id}.json`;
        const filePath = path.join(TEMPLATES_DIR, fileName);
        
        const content = {
            ...settings,
            _template_name: name,
            _template_desc: desc
        };
        
        fs.writeFileSync(filePath, JSON.stringify(content, null, 4));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/templates/:id', auth, (req, res) => {
    try {
        const filePath = path.join(TEMPLATES_DIR, req.params.id);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true });
        } else {
            res.status(404).send('No encontrado');
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/templates/:id', auth, (req, res) => {
    try {
        const filePath = path.join(TEMPLATES_DIR, req.params.id);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        res.json(content);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/settings', auth, async (req, res) => {
    try {
        const newSettings = req.body;
        // Eliminar metadatos de template antes de guardar en settings.json principal
        delete newSettings._template_name;
        delete newSettings._template_desc;

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(newSettings, null, 4));
        
        // Notificar al servidor que recargue los settings
        await sendCommand('reload');
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/command', auth, async (req, res) => {
    try {
        const { command } = req.body;
        if (!command) return res.status(400).send('Comando requerido');
        await sendCommand(command);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/logs', auth, (req, res) => {
    try {
        if (!fs.existsSync(LOG_FILE)) {
            return res.send("No hay logs disponibles.");
        }
        // Leer las últimas 100 líneas
        const logs = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').slice(-100).join('\n');
        res.send(logs);
    } catch (e) {
        res.status(500).send("Error leyendo logs: " + e.message);
    }
});

app.get('/api/status', auth, (req, res) => {
    res.json({ authenticated: true });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Para cualquier otra ruta, servir el index.html si está autenticado, sino login
app.use((req, res) => {
    if (!req.session.authenticated && req.path !== '/login.html') {
        return res.sendFile(path.join(__dirname, 'public/login.html'));
    }
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
    console.log(`Console activa en http://localhost:${PORT}`);
});
