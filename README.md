# Nexus Feedback & Complaint Discord Webhook Receiver

A simple, lightweight Node.js service that listens for feedback and complaints submitted from the Garry's Mod Nexus Library settings menu, applies rate limiting, and forwards them directly to your Discord channel via webhook.

---

## Features

- **Discord Webhooks**: Sends rich Discord embeds with color-coding (Green for Feedback, Red for Complaint), player SteamID with direct community profile link, player name, server hostname, and addon settings.
- **Dual Rate Limiting**:
  - **IP-based limit**: Configurable (default: 5 requests per 15 minutes per IP) via `express-rate-limit`.
  - **SteamID-based limit**: Secondary in-memory safeguard (max 3 submissions per 10 minutes per account) to block multi-IP spammers.
- **Flexible Protocol**: Runs on HTTP or native HTTPS (if SSL cert & key are provided in `.env`).
- **GMod Compatible**: Accepts both `application/json` bodies and URL-encoded form parameters sent by Garry's Mod `HTTP()`.

---

## Setup & Deployment on VPS

### 1. Upload files to your VPS
Upload the `backend` folder to your VPS (e.g. `/var/www/nexus-feedback` or `~/nexus-feedback`).

### 2. Install dependencies
```bash
cd backend
npm install
```

### 3. Configure environment variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and set your Discord Webhook URL:
```env
PORT=3051
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_id/your_webhook_token
RATE_LIMIT_WINDOW_MINUTES=15
RATE_LIMIT_MAX_REQUESTS=5

# (Optional) If you want Node to serve HTTPS directly with Let's Encrypt certificates:
# SSL_CERT_PATH=/etc/letsencrypt/live/yourdomain/fullchain.pem
# SSL_KEY_PATH=/etc/letsencrypt/live/yourdomain/privkey.pem
```

### 4. Run the application

#### Direct (Testing)
```bash
npm start
```

#### Production (using PM2 - Recommended)
```bash
npm install -g pm2
pm2 start server.js --name nexus-feedback
pm2 save
pm2 startup
```

---

## Endpoints

- `GET /`: Service status and port information
- `GET /health`: Healthcheck endpoint (`{ status: "ok", uptime: ... }`)
- `POST /feedback`: Receives feedback/complaints from Garry's Mod
