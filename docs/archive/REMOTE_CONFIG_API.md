# Remote Configuration API

Manage proPACE environment variables remotely via REST API.

## Overview

The Remote Configuration API allows you to view and update the `.env` file on the proPACE server without direct file system access. This is useful when you don't have SSH access to the machine.

## Security

⚠️ **IMPORTANT**: All API endpoints require authentication via Bearer token.

### Setting Up Authentication

1. Set `CONFIG_AUTH_TOKEN` in your `.env` file on the server:
   ```bash
   CONFIG_AUTH_TOKEN=your-secure-random-token-here
   ```

2. **NEVER use the default token `change-me-in-production` in production!**

3. Generate a secure token:
   ```bash
   # On macOS/Linux:
   openssl rand -base64 32

   # Or use Node.js:
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

## API Endpoints

Base URL: `http://10.0.0.69:3000/api`

### Authentication

All requests must include the `Authorization` header:

```
Authorization: Bearer YOUR_TOKEN_HERE
```

---

### GET /api/config

Get current environment configuration.

**Sensitive values are masked** (API keys, secrets, etc. show as `AIza...URw`).

#### Request

```bash
curl -X GET http://10.0.0.69:3000/api/config \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Response

```json
{
  "success": true,
  "config": {
    "PORT": "3000",
    "HOST": "0.0.0.0",
    "ANTHROPIC_API_KEY": "sk-a...xyz",
    "OPENAI_API_KEY": "sk-p...abc",
    "GOOGLE_SEARCH_API_KEY": "AIza...URw",
    "GOOGLE_SEARCH_ENGINE_ID": "c4f5...c98"
  }
}
```

---

### POST /api/config

Update environment variables.

⚠️ **Server restart required** for changes to take effect!

#### Request Body

```json
{
  "KEY1": "value1",
  "KEY2": "value2"
}
```

#### Example

```bash
curl -X POST http://10.0.0.69:3000/api/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "OPENAI_API_KEY": "sk-proj-new-key-here",
    "PORT": "9001"
  }'
```

#### Response

```json
{
  "success": true,
  "message": "Updated 2 environment variable(s)",
  "requiresRestart": true
}
```

---

### DELETE /api/config

Delete environment variables.

⚠️ **Server restart required** for changes to take effect!

#### Request Body

```json
{
  "keys": ["KEY1", "KEY2"]
}
```

#### Example

```bash
curl -X DELETE http://10.0.0.69:3000/api/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "keys": ["OLD_API_KEY", "UNUSED_VAR"]
  }'
```

#### Response

```json
{
  "success": true,
  "message": "Deleted 2 environment variable(s)",
  "requiresRestart": true
}
```

---

## Using the Shell Script

Convenience scripts are provided for easier command-line management.

### Setup

**Linux/macOS (Bash):**
```bash
export AUTH_TOKEN="your-secure-token"
export SERVER_URL="http://10.0.0.69:3000"  # Optional, defaults to this
```

**Windows (PowerShell):**
```powershell
$env:AUTH_TOKEN = "your-secure-token"
$env:SERVER_URL = "http://10.0.0.69:3000"  # Optional, defaults to this
```

### Commands

#### View Current Config

**Linux/macOS:**
```bash
AUTH_TOKEN=mytoken ./scripts/update-env.sh get
```

**Windows:**
```powershell
$env:AUTH_TOKEN='mytoken'; .\scripts\update-env.ps1 get
```

#### Update Variables

**Linux/macOS:**
```bash
# Update single variable
AUTH_TOKEN=mytoken ./scripts/update-env.sh set OPENAI_API_KEY=sk-new-key

# Update multiple variables
AUTH_TOKEN=mytoken ./scripts/update-env.sh set \
  OPENAI_API_KEY=sk-new-key \
  PORT=9001 \
  ENABLE_AGENT_MODE=true
```

**Windows:**
```powershell
# Update single variable
$env:AUTH_TOKEN='mytoken'; .\scripts\update-env.ps1 set OPENAI_API_KEY=sk-new-key

# Update multiple variables
$env:AUTH_TOKEN='mytoken'; .\scripts\update-env.ps1 set OPENAI_API_KEY=sk-new-key PORT=9001 ENABLE_AGENT_MODE=true
```

#### Delete Variables

**Linux/macOS:**
```bash
AUTH_TOKEN=mytoken ./scripts/update-env.sh delete OLD_KEY UNUSED_VAR
```

**Windows:**
```powershell
$env:AUTH_TOKEN='mytoken'; .\scripts\update-env.ps1 delete OLD_KEY UNUSED_VAR
```

---

## Error Responses

### 401 Unauthorized

Invalid or missing authentication token.

```json
{
  "success": false,
  "error": "Invalid authentication token"
}
```

### 400 Bad Request

Invalid request format.

```json
{
  "success": false,
  "error": "Invalid updates format"
}
```

---

## Backup

Before writing updates, the API automatically creates a backup:

```
.env.backup
```

If something goes wrong, you can restore the backup:

```bash
# On the server:
cp .env.backup .env
```

---

## Common Use Cases

### Update OpenAI API Key

```bash
AUTH_TOKEN=mytoken ./scripts/update-env.sh set \
  OPENAI_API_KEY=sk-proj-new-key-here
```

### Update Google Search Credentials

```bash
AUTH_TOKEN=mytoken ./scripts/update-env.sh set \
  GOOGLE_SEARCH_API_KEY=AIzaSyB... \
  GOOGLE_SEARCH_ENGINE_ID=c4f5514...
```

### Enable Agent Mode

```bash
AUTH_TOKEN=mytoken ./scripts/update-env.sh set ENABLE_AGENT_MODE=true
```

### Change Server Port

```bash
AUTH_TOKEN=mytoken ./scripts/update-env.sh set PORT=8080
```

---

## Security Best Practices

1. **Use a strong, random token** for `CONFIG_AUTH_TOKEN`
2. **Never commit** the token to version control
3. **Rotate the token** periodically
4. **Use HTTPS** in production (not HTTP)
5. **Limit access** to the API endpoint via firewall rules
6. **Monitor logs** for unauthorized access attempts

---

## Troubleshooting

### "Invalid authentication token"

- Verify `CONFIG_AUTH_TOKEN` is set in the server's `.env` file
- Ensure you're passing the correct token in the `Authorization` header
- Check there are no extra spaces or newlines in the token

### "File not found"

- The `.env` file doesn't exist on the server
- Create it manually or let the API create it on first update

### "Failed to update config"

- Check file permissions on the server
- Ensure the Node.js process has write access to the `.env` file

### Changes not taking effect

- Remember to **restart the proPACE server** after updating config
- The server reads `.env` only on startup

---

## Future Enhancements

- Web UI for config management
- Server restart endpoint
- Config validation before saving
- Audit log of config changes
- Environment variable templates
