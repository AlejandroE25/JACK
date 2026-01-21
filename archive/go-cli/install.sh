#!/bin/bash

# PACE Go CLI Installation Script
# This script checks for Go installation and builds the CLI client

set -e

echo "========================================="
echo "  PACE Go CLI - Installation Script"
echo "========================================="
echo ""

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed on your system."
    echo ""
    echo "Please install Go 1.21 or later:"
    echo ""
    echo "macOS:"
    echo "  brew install go"
    echo "  or download from https://go.dev/dl/"
    echo ""
    echo "Linux (Ubuntu/Debian):"
    echo "  sudo apt update && sudo apt install golang-go"
    echo ""
    echo "Windows:"
    echo "  Download from https://go.dev/dl/"
    echo ""
    exit 1
fi

# Check Go version
GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
REQUIRED_VERSION="1.21"

echo "✓ Go is installed: $(go version)"
echo ""

# Install dependencies
echo "Installing Go dependencies..."
go mod download
go mod tidy
echo "✓ Dependencies installed"
echo ""

# Detect platform
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
    Darwin)
        if [ "$ARCH" = "arm64" ]; then
            BINARY="pace-macos-arm64"
            GOOS="darwin"
            GOARCH="arm64"
        else
            BINARY="pace-macos-x64"
            GOOS="darwin"
            GOARCH="amd64"
        fi
        ;;
    Linux)
        if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
            BINARY="pace-linux-arm64"
            GOOS="linux"
            GOARCH="arm64"
        else
            BINARY="pace-linux-x64"
            GOOS="linux"
            GOARCH="amd64"
        fi
        ;;
    *)
        echo "❌ Unsupported operating system: $OS"
        echo "Please build manually using: make build"
        exit 1
        ;;
esac

echo "Building for your platform: $GOOS/$GOARCH"
echo ""

# Create build directory
mkdir -p build

# Build
echo "Building $BINARY..."
GOOS=$GOOS GOARCH=$GOARCH go build -ldflags="-s -w" -o "build/$BINARY" main.go

if [ $? -eq 0 ]; then
    echo "✓ Build successful!"
    echo ""

    # Make executable
    chmod +x "build/$BINARY"

    # Show binary info
    echo "Binary location: build/$BINARY"
    echo "Binary size: $(du -h "build/$BINARY" | cut -f1)"
    echo ""

    echo "========================================="
    echo "  Installation Complete!"
    echo "========================================="
    echo ""
    echo "To run the PACE CLI client:"
    echo "  ./build/$BINARY"
    echo ""
    echo "To install globally (optional):"
    echo "  sudo cp build/$BINARY /usr/local/bin/pace"
    echo "  pace"
    echo ""
    echo "To build for all platforms:"
    echo "  make build-all"
    echo ""
    echo "For more information:"
    echo "  cat README.md"
    echo "  cat QUICKSTART.md"
    echo ""
else
    echo "❌ Build failed"
    exit 1
fi
