# Remote Environment Variable Management

Complete guide for managing proPACE environment variables on remote servers without direct file access.

## Overview

The Remote Config API allows you to view and update the `.env` file on the proPACE server at **10.0.0.69:3000** from your local machine. This is essential when you don't have direct file system access to the server.

---

## Quick Start

### 1. Set Your Authentication Token Locally

The AUTH_TOKEN must match the `CONFIG_AUTH_TOKEN` set on the remote server.

**For current terminal session:**
```bash
export AUTH_TOKEN='your-secure-token-here'
```

**Permanently (add to ~/.zshrc or ~/.bash_profile):**
```bash
echo 'export AUTH_TOKEN="your-secure-token-here"' >> ~/.zshrc
source ~/.zshrc
```

**Verify it's set:**
```bash
echo $AUTH_TOKEN
```

### 2. View Current Remote Configuration

```bash
./scripts/update-env.sh get
```

**Example output:**
```json
{
  "success": true,
  "config": {
    "PORT": "9001",
    "HOST": "0.0.0.0",
    "ANTHROPIC_API_KEY": "sk-a...xyz",
    "GOOGLE_SEARCH_API_KEY": "AIza...iew",
    "GOOGLE_SEARCH_ENGINE_ID": "c4f5...c98"
  }
}
```

> **Note:** Sensitive values (API keys, secrets) are masked for security.

### 3. Update Environment Variables

**Single variable:**
```bash
./scripts/update-env.sh set GOOGLE_SEARCH_API_KEY=AIzaSyB5MEYmDfYtZnaRhARNst0AZfhYnJrxiew
```

**Multiple variables:**
```bash
./scripts/update-env.sh set \
  GOOGLE_SEARCH_API_KEY=AIzaSyB5MEYmDfYtZnaRhARNst0AZfhYnJrxiew \
  GOOGLE_SEARCH_ENGINE_ID=c4f5514344f414c98
```

**Response:**
```json
{
  "success": true,
  "message": "Updated 2 environment variable(s)",
  "requiresRestart": true
}
```

### 4. Restart the Remote Server

After updating environment variables, **the server must be restarted** for changes to take effect.

**Via SSH:**
```powershell
ssh user@10.0.0.69
nssm restart proPACE
```

**Or trigger auto-update (if enabled):**
The server will automatically restart during the next update cycle.

---

## Common Use Cases

### Update Google Search Credentials

```bash
./scripts/update-env.sh set \
  GOOGLE_SEARCH_API_KEY=AIzaSyB5MEYmDfYtZnaRhARNst0AZfhYnJrxiew \
  GOOGLE_SEARCH_ENGINE_ID=c4f5514344f414c98
```

### Update OpenAI API Key

```bash
./scripts/update-env.sh set OPENAI_API_KEY=sk-proj-new-key-here
```

### Enable Agent Mode

```bash
./scripts/update-env.sh set ENABLE_AGENT_MODE=true
```

### Change Server Port

```bash
./scripts/update-env.sh set PORT=8080
```

### Delete Unused Variables

```bash
./scripts/update-env.sh delete OLD_KEY UNUSED_VAR
```

---

## Authentication Setup

### On Remote Server (10.0.0.69)

The `CONFIG_AUTH_TOKEN` must be set in the server's `.env` file:

**Via SSH (one-time setup):**
```powershell
# Generate a secure token
$token = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
Write-Host "Token: $token"

# SSH to server
ssh user@10.0.0.69

# Add to .env
cd C:\path\to\proPACE
Add-Content -Path .env -Value "CONFIG_AUTH_TOKEN=$token"

# Restart server
nssm restart proPACE
```

### On Local Machine (Your Mac)

Set the same token as an environment variable:

```bash
export AUTH_TOKEN='same-token-as-server'
```

**Test the connection:**
```bash
./scripts/update-env.sh get
```

---

## Security Best Practices

1. **Use a strong, random token** - Never use the default "change-me-in-production"
   ```bash
   openssl rand -base64 32
   ```

2. **Never commit tokens to git** - Add to `.gitignore`:
   ```bash
   .env
   .env.local
   .env.*.local
   ```

3. **Rotate tokens periodically** - Change the token every 90 days:
   ```bash
   # Generate new token
   NEW_TOKEN=$(openssl rand -base64 32)

   # Update on server via SSH
   ssh user@10.0.0.69
   # Edit .env and replace CONFIG_AUTH_TOKEN

   # Update locally
   export AUTH_TOKEN="$NEW_TOKEN"
   ```

4. **Use HTTPS in production** - The current setup uses HTTP. For production:
   - Set up SSL/TLS certificate
   - Configure reverse proxy (nginx/Apache)
   - Update SERVER_URL to use `https://`

5. **Limit network access** - Use firewall rules to restrict API access:
   - Allow only from trusted IP addresses
   - Use VPN for remote access

---

## Troubleshooting

### Error: "AUTH_TOKEN environment variable not set"

**Cause:** The token isn't exported in your shell environment.

**Fix:**
```bash
export AUTH_TOKEN='your-token-here'
echo $AUTH_TOKEN  # Verify it's set
```

### Error: "Invalid authentication token"

**Cause:** Token mismatch between local and remote.

**Fix:**
1. Verify token on server:
   ```powershell
   ssh user@10.0.0.69
   type C:\path\to\proPACE\.env | findstr CONFIG_AUTH_TOKEN
   ```

2. Verify token locally:
   ```bash
   echo $AUTH_TOKEN
   ```

3. Ensure they match exactly (no extra spaces/newlines)

### Error: "Failed to update config"

**Cause:** Permission issues on the server.

**Fix:**
```powershell
ssh user@10.0.0.69
# Check .env file permissions
icacls C:\path\to\proPACE\.env
# Ensure the Node.js process has write access
```

### Changes not taking effect

**Cause:** Server wasn't restarted after updating config.

**Fix:**
```powershell
ssh user@10.0.0.69
nssm restart proPACE
```

### Connection timeout

**Cause:** Server not running or firewall blocking port 3000.

**Fix:**
1. Verify server is running:
   ```powershell
   ssh user@10.0.0.69
   nssm status proPACE
   ```

2. Check firewall rules:
   ```powershell
   netsh advfirewall firewall show rule name="proPACE"
   ```

---

## API Reference

### GET /api/config

Get current environment configuration (masked sensitive values).

**Request:**
```bash
curl -X GET http://10.0.0.69:3000/api/config \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "config": {
    "PORT": "3000",
    "ANTHROPIC_API_KEY": "sk-a...xyz"
  }
}
```

### POST /api/config

Update environment variables.

**Request:**
```bash
curl -X POST http://10.0.0.69:3000/api/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "GOOGLE_SEARCH_API_KEY": "AIzaSyB...",
    "GOOGLE_SEARCH_ENGINE_ID": "c4f5514..."
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Updated 2 environment variable(s)",
  "requiresRestart": true
}
```

### DELETE /api/config

Delete environment variables.

**Request:**
```bash
curl -X DELETE http://10.0.0.69:3000/api/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "keys": ["OLD_KEY", "UNUSED_VAR"]
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Deleted 2 environment variable(s)",
  "requiresRestart": true
}
```

---

## Auto-Migration Feature

New environment variables from `.env.example` are **automatically merged** during server updates.

**How it works:**
1. Server pulls latest code from git
2. Runs `migrate-env.ps1` (Windows) or `migrate-env.sh` (Linux/macOS)
3. Adds any new variables from `.env.example` to `.env`
4. Rebuilds and restarts

**Example:** If a new feature requires `NEW_FEATURE_FLAG=true` in `.env.example`, it will be automatically added to your `.env` on the next update.

---

## Platform-Specific Notes

### Windows Server (Current Setup)

- Script: `scripts/update-env.ps1`
- Auto-migration: `scripts/migrate-env.ps1`
- Service manager: NSSM
- Restart command: `nssm restart proPACE`

### Linux/macOS (Future)

- Script: `scripts/update-env.sh`
- Auto-migration: `scripts/migrate-env.sh`
- Service manager: systemd/pm2
- Restart command: `systemctl restart propace` or `pm2 restart proPACE`

---

## Related Documentation

- [REMOTE_CONFIG_API.md](REMOTE_CONFIG_API.md) - Full API specification
- [CLAUDE.md](../CLAUDE.md) - Project context for AI assistants
- [.env.example](../.env.example) - Environment variable template

---

## Support

**Issues:** https://github.com/AlejandroE25/proPACE/issues

**Quick Commands Reference:**
```bash
# View config
./scripts/update-env.sh get

# Update single variable
./scripts/update-env.sh set KEY=value

# Update multiple variables
./scripts/update-env.sh set KEY1=val1 KEY2=val2

# Delete variables
./scripts/update-env.sh delete KEY1 KEY2

# Test connection
curl http://10.0.0.69:3000/api/health
```
