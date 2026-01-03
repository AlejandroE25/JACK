#!/bin/bash
# Fix NSSM service configuration on remote Windows server

# Configuration
SERVER_USER="${SERVER_USER:-CDN4LIFE}"
SERVER_HOST="${SERVER_HOST:-10.0.0.69}"
PROJECT_PATH="C:/proPACE"

echo "🔧 Fixing proPACE service on ${SERVER_HOST}..."
echo "⚠️  You will be prompted for the Windows password"
echo ""

# Upload the fix script
echo "📤 Uploading fix script..."
scp -o PreferredAuthentications=password scripts/fix-nssm-config.ps1 "${SERVER_USER}@${SERVER_HOST}:C:/proPACE/scripts/"

if [ $? -ne 0 ]; then
    echo "❌ Failed to upload script"
    exit 1
fi

# Execute fix script on remote server
echo "🔨 Running fix script on remote server..."
ssh -o PreferredAuthentications=password "${SERVER_USER}@${SERVER_HOST}" "powershell -ExecutionPolicy Bypass -File C:/proPACE/scripts/fix-nssm-config.ps1"

if [ $? -eq 0 ]; then
    echo "✅ Service fixed successfully!"
    echo "🌐 Server should be accessible at http://${SERVER_HOST}:3000"
else
    echo "❌ Fix failed. Check the output above for details."
    exit 1
fi
