A simple, lightweight Node.js service that listens for feedback and complaints submitted from the Garry's Mod Nexus Library settings menu, applies rate limiting, and forwards them directly to your Discord channel via webhook.

---

## Features
- **Discord Webhooks**: Sends Discord embeds with player SteamID, player name, server hostname, and addon settings.
- **Rate Limiting**:
  - **IP-based limit**: Configurable (default: 5 requests per 15 minutes per IP).
  - **SteamID-based limit**
- **GMod Compatible**: Accepts both `application/json` bodies and URL-encoded form parameters.

---

Edit `.env` and set your Discord Webhook URL:
```env
PORT=3051
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your_webhook_id/your_webhook_token
RATE_LIMIT_WINDOW_MINUTES=15
RATE_LIMIT_MAX_REQUESTS=5
```
---

## Endpoints

- `GET /`: Service status and port information
- `GET /health`: Healthcheck endpoint (`{ status: "ok", uptime: ... }`)
- `POST /feedback`: Receives feedback/complaints from Garry's Mod
