# Windows Service Installation Script for proPACE using NSSM
# Run this script as Administrator

param(
    [string]$ServiceName = "proPACE",
    [string]$InstallPath = $PWD.Path,
    [string]$NodePath = "C:\Program Files\nodejs\node.exe"
)

Write-Host "`n=== proPACE Service Installation ===" -ForegroundColor Cyan
Write-Host "Installing proPACE as a Windows service using NSSM`n" -ForegroundColor Yellow

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'`n" -ForegroundColor Yellow
    exit 1
}

# Check if NSSM is installed
$nssmPath = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $nssmPath) {
    Write-Host "ERROR: NSSM is not installed or not in PATH" -ForegroundColor Red
    Write-Host "`nPlease install NSSM first:" -ForegroundColor Yellow
    Write-Host "  Option 1 (Chocolatey): choco install nssm" -ForegroundColor White
    Write-Host "  Option 2 (WinGet):     winget install NSSM.NSSM" -ForegroundColor White
    Write-Host "  Option 3 (Manual):     Download from https://github.com/kirillkovalenko/nssm/releases`n" -ForegroundColor White
    exit 1
}

Write-Host "✓ NSSM found at: $($nssmPath.Source)" -ForegroundColor Green

# Check if Node.js exists
if (-not (Test-Path $NodePath)) {
    Write-Host "`nWARNING: Node.js not found at: $NodePath" -ForegroundColor Yellow
    $foundNode = Get-Command node -ErrorAction SilentlyContinue
    if ($foundNode) {
        $NodePath = $foundNode.Source
        Write-Host "Using Node.js from PATH: $NodePath" -ForegroundColor Green
    } else {
        Write-Host "ERROR: Node.js not found!" -ForegroundColor Red
        Write-Host "Please install Node.js or specify the path with -NodePath parameter`n" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "✓ Node.js found at: $NodePath" -ForegroundColor Green

# Check if project is built
$serverPath = Join-Path $InstallPath "dist\src\server\index.js"
if (-not (Test-Path $serverPath)) {
    Write-Host "`nERROR: Server not built!" -ForegroundColor Red
    Write-Host "Please run: .\scripts\rebuild-windows.ps1`n" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Server build found at: $serverPath" -ForegroundColor Green

# Check if .env exists
$envPath = Join-Path $InstallPath ".env"
if (-not (Test-Path $envPath)) {
    Write-Host "`nWARNING: .env file not found!" -ForegroundColor Yellow
    Write-Host "The service will fail to start without API keys." -ForegroundColor Yellow
    Write-Host "Press Ctrl+C to cancel and create .env, or Enter to continue..." -ForegroundColor Yellow
    Read-Host
}

# Create logs directory
$logsPath = Join-Path $InstallPath "logs"
if (-not (Test-Path $logsPath)) {
    New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
    Write-Host "✓ Created logs directory" -ForegroundColor Green
}

# Stop and remove existing service if it exists
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "`nRemoving existing service..." -ForegroundColor Yellow
    nssm stop $ServiceName 2>&1 | Out-Null
    nssm remove $ServiceName confirm 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    Write-Host "✓ Removed existing service" -ForegroundColor Green
}

# Install the service
Write-Host "`nInstalling service..." -ForegroundColor Yellow
nssm install $ServiceName $NodePath $serverPath
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install service" -ForegroundColor Red
    exit 1
}

# Configure service
Write-Host "Configuring service..." -ForegroundColor Yellow
nssm set $ServiceName AppDirectory $InstallPath
nssm set $ServiceName AppStdout "$logsPath\service-stdout.log"
nssm set $ServiceName AppStderr "$logsPath\service-stderr.log"
nssm set $ServiceName AppRotateFiles 1
nssm set $ServiceName AppRotateOnline 1
nssm set $ServiceName AppRotateBytes 10485760  # 10MB
nssm set $ServiceName DisplayName "proPACE AI Assistant"
nssm set $ServiceName Description "Personal AI Assistant with persistent memory"
nssm set $ServiceName Start SERVICE_AUTO_START

Write-Host "✓ Service configured" -ForegroundColor Green

# Start the service
Write-Host "`nStarting service..." -ForegroundColor Yellow
nssm start $ServiceName
Start-Sleep -Seconds 3

# Check status
$status = nssm status $ServiceName
if ($status -eq "SERVICE_RUNNING") {
    Write-Host "✓ Service started successfully!" -ForegroundColor Green
} else {
    Write-Host "WARNING: Service status: $status" -ForegroundColor Yellow
    Write-Host "Check logs at: $logsPath" -ForegroundColor Yellow
}

# Display service info
Write-Host "`n=== Service Installation Complete ===" -ForegroundColor Cyan
Write-Host "`nService Name:  $ServiceName" -ForegroundColor White
Write-Host "Status:        $(nssm status $ServiceName)" -ForegroundColor White
Write-Host "Install Path:  $InstallPath" -ForegroundColor White
Write-Host "Logs:          $logsPath" -ForegroundColor White

Write-Host "`nUseful Commands:" -ForegroundColor Yellow
Write-Host "  Start:   nssm start $ServiceName" -ForegroundColor White
Write-Host "  Stop:    nssm stop $ServiceName" -ForegroundColor White
Write-Host "  Restart: nssm restart $ServiceName" -ForegroundColor White
Write-Host "  Status:  nssm status $ServiceName" -ForegroundColor White
Write-Host "  Remove:  nssm remove $ServiceName confirm`n" -ForegroundColor White

Write-Host "View logs with: Get-Content $logsPath\service-stdout.log -Tail 50 -Wait`n" -ForegroundColor Cyan
