const fs = require("fs");
const http = require("http");
const https = require("https");
const express = require("express");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3051;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || "";

// Ensure IPs are accurate behind reverse proxies
app.set("trust proxy", 1);

// Middleware for parsing JSON & urlencoded bodies
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true, limit: "64kb" }));

// IP based Rate Limiter
const windowMinutes = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10) || 15;
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 5;

const ipLimiter = rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: `Rate limit exceeded.`
    }
});

app.use("/feedback", ipLimiter);

// SteamID based Rate Limiter
const steamRateMap = new Map();
const STEAM_LIMIT_WINDOW = 10 * 60 * 1000; // 10 mins
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

async function sendDiscordWebhook(embed) {
    if (!DISCORD_WEBHOOK_URL || !DISCORD_WEBHOOK_URL.startsWith("https://discord.com/api/webhooks/")) {
        console.warn("[ Nexus Feedback ][ Webhook ERROR ] DISCORD_WEBHOOK_URL is not valid.");
        return false;
    }

    const payload = JSON.stringify({
        username: "Nexus Feedback",
        avatar_url: "https://i.imgur.com/KD3QMpr.png",
        embeds: [embed]
    });

    try {
        const response = await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`[ Nexus Feedback ][ Webhook ERROR ] ${response.status}: ${text}`);
            return false;
        }

        return true;
    } catch (err) {
        console.error("[ Nexus Feedback ][ Webhook ERROR ]", err.message);
        return false;
    }
}

app.post("/feedback", async (req, res) => {
    const data = req.body || {};

    const type = (data.type && String(data.type).trim().toLowerCase() === "complaint") ? "Complaint" : "Feedback";
    const message = data.message ? String(data.message).trim() : "";
    const steamid = data.steamid ? String(data.steamid).trim() : "Unknown";
    const name = data.name ? String(data.name).trim() : "Unknown Player";
    const server = data.server ? String(data.server).trim() : "Unknown Server";
    const theme = data.theme ? String(data.theme).trim() : "default";
    const language = data.language ? String(data.language).trim() : "en";

    // Validation
    if (!message || message.length < 3) {
        return res.status(400).json({
            success: false,
            error: "Message must be at least 3 characters long."
        });
    }

    if (message.length > 2000) {
        return res.status(400).json({
            success: false,
            error: "Message exceeds maximum length of 2000 characters."
        });
    }

    // Check SteamID rate limit
    if (isSteamRateLimited(steamid)) {
        return res.status(429).json({
            success: false,
            error: "You have been rate limited."
        });
    }

    const color = type === "Complaint" ? 0xED4245 : 0x57F287;
    const icon = type === "Complaint" ? "⚠️" : "💡";

    const steamProfile = (steamid !== "Unknown" && /^\d{17}$/.test(steamid))
        ? "[${steamid}](https://steamcommunity.com/profiles/${steamid})"
        : steamid;

    const embed = {
        title: `${icon} New ${type} Received`,
        color: color,
        description: message,
        fields: [
            {
                name: "Player",
                value: `**${name}**\nSteamID: ${steamProfile}`,
                inline: true
            },
            {
                name: "Server",
                value: server,
                inline: true
            },
            {
                name: "Settings",
                value: `Language: \`${language}\`\nTheme: \`${theme}\`\nVersion: \`${version}\``,
                inline: true
            }
        ],
        footer: {
            text: `IP: ${req.ip || req.socket.remoteAddress || "Unknown"}`
        },
        timestamp: new Date().toISOString()
    };

    console.log(`[${new Date().toISOString()}] Incoming ${type} from ${name} (${steamid}) on "${server}"`);

    const sent = await sendDiscordWebhook(embed);

    if (!sent && DISCORD_WEBHOOK_URL) {
        return res.status(500).json({
            success: false,
            error: "Failed to deliver webhook to Discord."
        });
    }

    return res.status(200).json({
        success: true,
        message: `${type} submitted successfully!`
    });
});

http.createServer(app).listen(PORT, '0.0.0.0', () => {
    console.log(`[ Nexus Feedback ][ Server ] HTTP server listening on http://0.0.0.0:${PORT}`);
    if (!DISCORD_WEBHOOK_URL) {
        console.warn("[ Nexus Feedback ][ Server ERROR ] DISCORD_WEBHOOK_URL is not set.");
    }
});
