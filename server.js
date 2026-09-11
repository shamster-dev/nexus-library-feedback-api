const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3051;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

// Enable trust proxy so client IPs are accurate behind reverse proxies (Nginx, Cloudflare, etc.)
app.set('trust proxy', 1);

// Middleware for parsing JSON and form-urlencoded bodies from GMod HTTP requests
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));

// 1. IP-based Rate Limiter (Default: 5 requests per 15 minutes per IP)
const windowMinutes = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15;
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 5;

const ipLimiter = rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: `Rate limit exceeded. Please wait ${windowMinutes} minutes before submitting again.`
    }
});

// Apply rate limiter specifically to the feedback endpoint
app.use('/feedback', ipLimiter);

// 2. SteamID-based Rate Limiter (prevents spamming from rotating IPs)
const steamRateMap = new Map();
const STEAM_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes
const STEAM_LIMIT_MAX = 3;

function isSteamRateLimited(steamid) {
    if (!steamid || steamid === 'Unknown') return false;
    const now = Date.now();
    const timestamps = steamRateMap.get(steamid) || [];
    const recent = timestamps.filter(t => now - t < STEAM_LIMIT_WINDOW);

    if (recent.length >= STEAM_LIMIT_MAX) {
        return true;
    }

    recent.push(now);
    steamRateMap.set(steamid, recent);
    return false;
}

// Health check endpoint
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        service: 'Nexus Feedback & Complaint Receiver',
        port: PORT
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

// Helper function to send Discord Webhook using native fetch or https fallback
async function sendDiscordWebhook(embed) {
    if (!DISCORD_WEBHOOK_URL || !DISCORD_WEBHOOK_URL.startsWith('https://discord.com/api/webhooks/')) {
        console.warn('[Nexus Feedback] DISCORD_WEBHOOK_URL is not configured or invalid. Check your .env file.');
        return false;
    }

    const payload = JSON.stringify({
        username: 'Nexus Feedback Bot',
        avatar_url: 'https://i.imgur.com/KD3QMpr.png',
        embeds: [embed]
    });

    try {
        if (typeof fetch === 'function') {
            const response = await fetch(DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(`[Discord Webhook Error] Status ${response.status}: ${text}`);
                return false;
            }
            return true;
        } else {
            // Fallback for older Node.js versions without global fetch
            return new Promise((resolve) => {
                const url = new URL(DISCORD_WEBHOOK_URL);
                const options = {
                    hostname: url.hostname,
                    port: 443,
                    path: url.pathname + url.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    }
                };

                const req = https.request(options, (res) => {
                    resolve(res.statusCode >= 200 && res.statusCode < 300);
                });

                req.on('error', (err) => {
                    console.error('[Discord Webhook Error]', err.message);
                    resolve(false);
                });

                req.write(payload);
                req.end();
            });
        }
    } catch (err) {
        console.error('[Discord Webhook Exception]', err.message);
        return false;
    }
}

// POST /feedback endpoint
app.post('/feedback', async (req, res) => {
    const data = req.body || {};

    const type = (data.type && String(data.type).trim().toLowerCase() === 'complaint') ? 'Complaint' : 'Feedback';
    const message = data.message ? String(data.message).trim() : '';
    const steamid = data.steamid ? String(data.steamid).trim() : 'Unknown';
    const name = data.name ? String(data.name).trim() : 'Unknown Player';
    const server = data.server ? String(data.server).trim() : 'Unknown Server';
    const theme = data.theme ? String(data.theme).trim() : 'default';
    const language = data.language ? String(data.language).trim() : 'en';
    const version = data.version ? String(data.version).trim() : '2.0';

    // Validation
    if (!message || message.length < 3) {
        return res.status(400).json({
            success: false,
            error: 'Message must be at least 3 characters long.'
        });
    }

    if (message.length > 2000) {
        return res.status(400).json({
            success: false,
            error: 'Message exceeds maximum length of 2000 characters.'
        });
    }

    // Check SteamID rate limit
    if (isSteamRateLimited(steamid)) {
        return res.status(429).json({
            success: false,
            error: 'Too many submissions for this Steam account. Please try again in a few minutes.'
        });
    }

    // Discord Embed Colors:
    // Complaint = Red (0xED4245), Feedback = Green (0x57F287)
    const color = type === 'Complaint' ? 0xED4245 : 0x57F287;
    const icon = type === 'Complaint' ? '⚠️' : '💡';

    const steamProfile = (steamid !== 'Unknown' && /^\d{17}$/.test(steamid))
        ? `[${steamid}](https://steamcommunity.com/profiles/${steamid})`
        : steamid;

    const embed = {
        title: `${icon} New ${type} Received`,
        color: color,
        description: message,
        fields: [
            {
                name: '👤 Player',
                value: `**${name}**\nSteamID: ${steamProfile}`,
                inline: true
            },
            {
                name: '🖥️ Server',
                value: server,
                inline: true
            },
            {
                name: '⚙️ Settings',
                value: `Language: \`${language}\`\nTheme: \`${theme}\`\nVersion: \`${version}\``,
                inline: true
            }
        ],
        footer: {
            text: `Nexus Library Feedback System • IP: ${req.ip || req.socket.remoteAddress || 'Unknown'}`
        },
        timestamp: new Date().toISOString()
    };

    console.log(`[${new Date().toISOString()}] Incoming ${type} from ${name} (${steamid}) on "${server}"`);

    const sent = await sendDiscordWebhook(embed);

    if (!sent && DISCORD_WEBHOOK_URL) {
        return res.status(500).json({
            success: false,
            error: 'Failed to deliver webhook to Discord.'
        });
    }

    return res.status(200).json({
        success: true,
        message: `${type} submitted successfully!`
    });
});

// Start Server (HTTPS if certs provided, otherwise HTTP)
const sslCertPath = process.env.SSL_CERT_PATH;
const sslKeyPath = process.env.SSL_KEY_PATH;

if (sslCertPath && sslKeyPath && fs.existsSync(sslCertPath) && fs.existsSync(sslKeyPath)) {
    try {
        const httpsOptions = {
            cert: fs.readFileSync(sslCertPath),
            key: fs.readFileSync(sslKeyPath)
        };

        https.createServer(httpsOptions, app).listen(PORT, '0.0.0.0', () => {
            console.log(`[Nexus Feedback] HTTPS server listening on https://0.0.0.0:${PORT}`);
        });
    } catch (err) {
        console.error('[Nexus Feedback] Failed to start HTTPS server, falling back to HTTP:', err.message);
        http.createServer(app).listen(PORT, '0.0.0.0', () => {
            console.log(`[Nexus Feedback] HTTP server listening on http://0.0.0.0:${PORT}`);
        });
    }
} else {
    http.createServer(app).listen(PORT, '0.0.0.0', () => {
        console.log(`[Nexus Feedback] HTTP server listening on http://0.0.0.0:${PORT}`);
        if (!DISCORD_WEBHOOK_URL) {
            console.warn('[Nexus Feedback] WARNING: DISCORD_WEBHOOK_URL is not set in .env! Incoming feedback will not reach Discord.');
        }
    });
}
