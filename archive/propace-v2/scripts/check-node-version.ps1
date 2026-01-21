# Check Node.js version and wrtc compatibility

Write-Host "Checking Node.js version and wrtc compatibility..." -ForegroundColor Cyan
Write-Host ""

# Get Node.js version
$nodeVersion = node --version
Write-Host "Current Node.js version: $nodeVersion" -ForegroundColor Yellow

# Extract major version number
if ($nodeVersion -match 'v(\d+)\.') {
    $majorVersion = [int]$Matches[1]
    Write-Host "Major version: $majorVersion" -ForegroundColor Gray
    Write-Host ""

    # Check compatibility
    if ($majorVersion -ge 20) {
        Write-Host "WARNING: wrtc package does not support Node.js $majorVersion" -ForegroundColor Red
        Write-Host ""
        Write-Host "wrtc compatibility:" -ForegroundColor Yellow
        Write-Host "  - Supports: Node.js 10, 12, 14, 16, 18" -ForegroundColor Gray
        Write-Host "  - Last updated: 2020" -ForegroundColor Gray
        Write-Host "  - Does NOT support: Node.js 20+" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Recommended solutions:" -ForegroundColor Cyan
        Write-Host "  1. Downgrade to Node.js 18 LTS (Recommended)" -ForegroundColor White
        Write-Host "     - Download: https://nodejs.org/dist/latest-v18.x/" -ForegroundColor Gray
        Write-Host "     - Node 18 is maintained until April 2025" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  2. Use alternative WebRTC library" -ForegroundColor White
        Write-Host "     - werift (pure JavaScript, Node 20+ compatible)" -ForegroundColor Gray
        Write-Host "     - Requires code refactoring" -ForegroundColor Gray
        Write-Host ""
    } elseif ($majorVersion -ge 18) {
        Write-Host "Node.js $majorVersion is compatible with wrtc" -ForegroundColor Green
        Write-Host "You can install wrtc with: npm install wrtc" -ForegroundColor White
    } else {
        Write-Host "Node.js $majorVersion may have limited wrtc support" -ForegroundColor Yellow
        Write-Host "Recommended: Upgrade to Node.js 18 LTS" -ForegroundColor White
    }
} else {
    Write-Host "Could not parse Node.js version" -ForegroundColor Red
}

Write-Host ""
Write-Host "Check complete" -ForegroundColor Cyan
