The Node.js application that is used to submit complaints and feedback for the Nexus Library. 

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

- `POST /feedback`: Receives feedback/complaints from Garry's Mod
