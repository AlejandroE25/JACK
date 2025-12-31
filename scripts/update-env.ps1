# Remote .env Configuration Management Script (PowerShell)
#
# Usage:
#   .\scripts\update-env.ps1 get                    # View current config
#   .\scripts\update-env.ps1 set KEY=value          # Update single variable
#   .\scripts\update-env.ps1 set KEY1=val1 KEY2=val2  # Update multiple variables
#   .\scripts\update-env.ps1 delete KEY1 KEY2       # Delete variables
#
# Environment variables:
#   $env:SERVER_URL - proPACE server URL (default: http://10.0.0.69:3000)
#   $env:AUTH_TOKEN - Authentication token for API (required)

param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidateSet('get', 'set', 'delete', 'help')]
    [string]$Command,

    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

# Configuration
$SERVER_URL = if ($env:SERVER_URL) { $env:SERVER_URL } else { "http://10.0.0.69:3000" }
$AUTH_TOKEN = $env:AUTH_TOKEN

# Check if auth token is set
if (-not $AUTH_TOKEN) {
    Write-Error "Error: AUTH_TOKEN environment variable not set"
    Write-Host "Usage: `$env:AUTH_TOKEN='your_token'; .\scripts\update-env.ps1 <command>"
    exit 1
}

# Function to get current config
function Get-Config {
    Write-Host "Fetching current configuration from ${SERVER_URL}..."

    $headers = @{
        "Authorization" = "Bearer $AUTH_TOKEN"
        "Content-Type" = "application/json"
    }

    try {
        $response = Invoke-RestMethod -Uri "$SERVER_URL/api/config" -Method Get -Headers $headers
        $response | ConvertTo-Json -Depth 10
    } catch {
        Write-Error "Failed to get config: $_"
        exit 1
    }
}

# Function to update config
function Set-Config {
    param([string[]]$Args)

    if ($Args.Count -eq 0) {
        Write-Error "Error: No variables specified"
        Write-Host "Usage: .\update-env.ps1 set KEY=value [KEY2=value2 ...]"
        exit 1
    }

    $updates = @{}

    # Parse KEY=value pairs
    foreach ($arg in $Args) {
        if ($arg -match '^([A-Z_][A-Z0-9_]*)=(.+)$') {
            $key = $matches[1]
            $value = $matches[2]
            $updates[$key] = $value
        } else {
            Write-Error "Error: Invalid format '$arg'. Expected KEY=value"
            exit 1
        }
    }

    Write-Host "Updating configuration..."
    Write-Host "Updates: $($updates | ConvertTo-Json -Compress)"

    $headers = @{
        "Authorization" = "Bearer $AUTH_TOKEN"
        "Content-Type" = "application/json"
    }

    $body = $updates | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$SERVER_URL/api/config" -Method Post -Headers $headers -Body $body
        $response | ConvertTo-Json -Depth 10
        Write-Host ""
        Write-Host "⚠️  Server restart required for changes to take effect!" -ForegroundColor Yellow
    } catch {
        Write-Error "Failed to update config: $_"
        exit 1
    }
}

# Function to delete config keys
function Remove-ConfigKeys {
    param([string[]]$Keys)

    if ($Keys.Count -eq 0) {
        Write-Error "Error: No keys specified"
        Write-Host "Usage: .\update-env.ps1 delete KEY1 [KEY2 ...]"
        exit 1
    }

    Write-Host "Deleting configuration keys: $($Keys -join ', ')"

    $headers = @{
        "Authorization" = "Bearer $AUTH_TOKEN"
        "Content-Type" = "application/json"
    }

    $body = @{ keys = $Keys } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$SERVER_URL/api/config" -Method Delete -Headers $headers -Body $body
        $response | ConvertTo-Json -Depth 10
        Write-Host ""
        Write-Host "⚠️  Server restart required for changes to take effect!" -ForegroundColor Yellow
    } catch {
        Write-Error "Failed to delete config: $_"
        exit 1
    }
}

# Function to show help
function Show-Help {
    Write-Host "proPACE Remote Configuration Management"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  .\update-env.ps1 get                           - View current configuration"
    Write-Host "  .\update-env.ps1 set KEY=value [KEY2=val2...]  - Update environment variables"
    Write-Host "  .\update-env.ps1 delete KEY1 [KEY2...]         - Delete environment variables"
    Write-Host ""
    Write-Host "Environment Variables:"
    Write-Host "  `$env:SERVER_URL - Server URL (default: http://10.0.0.69:3000)"
    Write-Host "  `$env:AUTH_TOKEN - Authentication token (required)"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  `$env:AUTH_TOKEN='mytoken'; .\update-env.ps1 get"
    Write-Host "  `$env:AUTH_TOKEN='mytoken'; .\update-env.ps1 set OPENAI_API_KEY=sk-..."
    Write-Host "  `$env:AUTH_TOKEN='mytoken'; .\update-env.ps1 set PORT=9001 HOST=0.0.0.0"
    Write-Host "  `$env:AUTH_TOKEN='mytoken'; .\update-env.ps1 delete OLD_KEY"
}

# Main command dispatcher
switch ($Command) {
    'get' {
        Get-Config
    }
    'set' {
        Set-Config -Args $Arguments
    }
    'delete' {
        Remove-ConfigKeys -Keys $Arguments
    }
    'help' {
        Show-Help
    }
}
