#!/usr/bin/env pwsh
<#
.SYNOPSIS
Fix NSSM service configuration for proPACE

.DESCRIPTION
Updates NSSM service to use correct entry point (dist/main.js instead of dist/src/server/index.js)
#>

param(
    [string]$ServiceName = "proPACE",
    [string]$ProjectPath = "C:\proPACE",
    [string]$NssmPath = "C:\nssm\win64\nssm.exe"
)

Write-Host "🔧 Fixing NSSM service configuration..." -ForegroundColor Cyan

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

# Check if NSSM exists
if (-not (Test-Path $NssmPath)) {
    Write-Error "NSSM not found at $NssmPath"
    Write-Host "Please install NSSM from https://nssm.cc/download" -ForegroundColor Yellow
    exit 1
}

# Check if service exists
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $service) {
    Write-Error "Service '$ServiceName' not found"
    exit 1
}

# Stop service if running
Write-Host "🛑 Stopping service..." -ForegroundColor Yellow
& $NssmPath stop $ServiceName
Start-Sleep -Seconds 3

# Get Node.js path
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    $nodePath = "C:\Program Files\nodejs\node.exe"
}

Write-Host "📝 Updating NSSM configuration..." -ForegroundColor Cyan

# Update NSSM service configuration
& $NssmPath set $ServiceName Application $nodePath
& $NssmPath set $ServiceName AppDirectory $ProjectPath
& $NssmPath set $ServiceName AppParameters "dist\main.js"
& $NssmPath set $ServiceName DisplayName "proPACE AI Assistant"
& $NssmPath set $ServiceName Description "proPACE AI Assistant Server with WebRTC TTS"

# Configure logging
$logsDir = Join-Path $ProjectPath "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

& $NssmPath set $ServiceName AppStdout (Join-Path $logsDir "service-out.log")
& $NssmPath set $ServiceName AppStderr (Join-Path $logsDir "service-error.log")
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName AppRotateBytes 1048576  # 1MB

# Configure automatic restart
& $NssmPath set $ServiceName AppExit Default Restart

Write-Host "✅ NSSM configuration updated" -ForegroundColor Green

# Rebuild project
Write-Host "`n🔨 Rebuilding project..." -ForegroundColor Cyan
Set-Location $ProjectPath

# Clean old build
if (Test-Path "dist") {
    Remove-Item -Recurse -Force dist
}

# Install dependencies (in case anything is missing)
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
npm install --omit=optional --legacy-peer-deps

# Build
Write-Host "🔨 Building TypeScript..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed!"
    exit 1
}

# Verify entry point exists
$entryPoint = Join-Path $ProjectPath "dist\main.js"
if (-not (Test-Path $entryPoint)) {
    Write-Error "Entry point not found at $entryPoint"
    exit 1
}

Write-Host "✅ Build successful" -ForegroundColor Green

# Start service
Write-Host "`n▶️  Starting service..." -ForegroundColor Cyan
& $NssmPath start $ServiceName
Start-Sleep -Seconds 5

# Check status
$status = & $NssmPath status $ServiceName
Write-Host "`n📊 Service Status: $status" -ForegroundColor $(if ($status -eq "SERVICE_RUNNING") { "Green" } else { "Red" })

if ($status -ne "SERVICE_RUNNING") {
    Write-Host "`n❌ Service failed to start. Check logs:" -ForegroundColor Red
    Write-Host "  Error log: $logsDir\service-error.log" -ForegroundColor Yellow
    Write-Host "  Output log: $logsDir\service-out.log" -ForegroundColor Yellow
    Write-Host "`nLast 20 lines of error log:" -ForegroundColor Yellow
    Get-Content (Join-Path $logsDir "service-error.log") -Tail 20 -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "`n✅ Service is running successfully!" -ForegroundColor Green
Write-Host "🌐 Server should be accessible at http://localhost:3000" -ForegroundColor Cyan
