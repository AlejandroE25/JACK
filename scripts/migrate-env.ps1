# Environment Migration Script (PowerShell)
# Adds new environment variables from .env.example to .env
# Run this after git pull to update .env with new variables

$ENV_FILE = ".env"
$EXAMPLE_FILE = ".env.example"

if (-not (Test-Path $EXAMPLE_FILE)) {
    Write-Error "Error: $EXAMPLE_FILE not found"
    exit 1
}

if (-not (Test-Path $ENV_FILE)) {
    Write-Host "Creating $ENV_FILE from $EXAMPLE_FILE"
    Copy-Item $EXAMPLE_FILE $ENV_FILE
    Write-Host "✅ Created $ENV_FILE" -ForegroundColor Green
    exit 0
}

Write-Host "Checking for new environment variables..."

# Read existing keys from .env
$existingKeys = @{}
Get-Content $ENV_FILE | ForEach-Object {
    $line = $_.Trim()
    if ($line -match '^([A-Z_][A-Z0-9_]*)=') {
        $existingKeys[$matches[1]] = $true
    }
}

# Read new variables from .env.example
$newVariables = @()
Get-Content $EXAMPLE_FILE | ForEach-Object {
    $line = $_.Trim()

    # Skip comments and empty lines
    if ($line -match '^#' -or $line -eq '') {
        return
    }

    # Extract key (before =)
    if ($line -match '^([A-Z_][A-Z0-9_]*)=') {
        $key = $matches[1]

        # Check if key exists in .env
        if (-not $existingKeys.ContainsKey($key)) {
            Write-Host "  Adding new variable: $key"
            $newVariables += $line
        }
    }
}

# Append new variables to .env
if ($newVariables.Count -gt 0) {
    Add-Content -Path $ENV_FILE -Value $newVariables
}

Write-Host "✅ Environment migration complete" -ForegroundColor Green
