# Quick Start Guide - PACE Go CLI

## Prerequisites

You need to install Go first. The CLI client is written in Go and requires Go 1.21 or later to build.

### Installing Go

**macOS:**
```bash
brew install go
# or download from https://go.dev/dl/
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install golang-go

# Or download from https://go.dev/dl/
```

**Windows:**
Download and install from [https://go.dev/dl/](https://go.dev/dl/)

**Verify installation:**
```bash
go version
# Should show: go version go1.21.x or later
```

## Building the Client

### Option 1: Quick Build (Current Platform Only)

```bash
cd go-cli

# Install dependencies
make install-deps

# Build for your current platform
make build

# The binary will be in build/ directory
# macOS: build/pace-cli
# Linux: build/pace-cli
# Windows: build/pace-cli.exe
```

### Option 2: Build All Platforms

```bash
cd go-cli

# Install dependencies
make install-deps

# Build for all platforms
make build-all

# Binaries will be in build/ directory:
# - build/pace-macos-x64 (Intel Macs)
# - build/pace-macos-arm64 (M1/M2/M3 Macs)
# - build/pace-linux-x64 (Linux x64)
# - build/pace-linux-arm64 (Linux ARM)
# - build/pace-windows-x64.exe (Windows)
```

## Running the Client

### 1. Start the proPACE Server

In the main proPACE directory (NOT in go-cli/):
```bash
npm run dev
```

The server will start on `http://localhost:9001`

### 2. Run the Go Client

In a **new terminal window**:

**macOS (Intel):**
```bash
cd go-cli
./build/pace-macos-x64
```

**macOS (Apple Silicon):**
```bash
cd go-cli
./build/pace-macos-arm64
```

**Linux:**
```bash
cd go-cli
./build/pace-linux-x64
```

**Windows:**
```bash
cd go-cli
build\pace-windows-x64.exe
```

## First Time Setup

1. Make the binary executable (macOS/Linux only):
```bash
chmod +x build/pace-macos-arm64
```

2. Optionally, add to your PATH:
```bash
# macOS/Linux
sudo cp build/pace-macos-arm64 /usr/local/bin/pace

# Now you can run from anywhere:
pace
```

## Usage

Once connected, you can:

- **Chat with PACE**: Just type your message and press Enter
- **View weather**: Automatically refreshes every 15 minutes
- **Browse news**: Use arrow keys (← →) to navigate headlines
- **Commands**:
  - `/quit` or `/exit` - Exit
  - `/clear` - Clear conversation
  - `/refresh` - Force refresh weather and news
  - `/help` - Show help

## Troubleshooting

### "go: command not found"
- Go is not installed. See "Installing Go" section above.

### "failed to connect: connection refused"
- The proPACE server is not running
- Run `npm run dev` in the main proPACE directory first

### "permission denied" (macOS/Linux)
- Make the binary executable:
```bash
chmod +x build/pace-macos-arm64
```

### Terminal display looks broken
- Use a modern terminal (iTerm2, Windows Terminal)
- Ensure terminal size is at least 80x24
- Check that your LANG is set to UTF-8:
```bash
echo $LANG  # Should show something like en_US.UTF-8
```

### Build errors
- Ensure Go 1.21+ is installed: `go version`
- Clean and rebuild:
```bash
make clean
make install-deps
make build
```

## Next Steps

### Customize Connection

**Connect to different host/port:**
```bash
./build/pace-macos-arm64 --host 192.168.1.100 --port 9001
```

**Use environment variables:**
```bash
export PACE_HOST=192.168.1.100
export PACE_PORT=9001
./build/pace-macos-arm64
```

### Development

**Run without building:**
```bash
make run
```

**Run tests:**
```bash
make test
```

**Build release version (optimized):**
```bash
make build-release
```

## File Locations

After building:
- **Binaries**: `go-cli/build/`
- **Source code**: `go-cli/internal/` and `go-cli/pkg/`
- **Config**: Command-line flags or environment variables (no config file)

## Comparison with TypeScript CLI

| Feature | TypeScript CLI | Go CLI |
|---------|---------------|--------|
| Command to run | `npm run cli` | `./build/pace-macos-arm64` |
| Requires Node.js | ✅ Yes | ❌ No |
| Binary size | ~50MB | ~5-10MB |
| Startup | ~200ms | <100ms |

## Getting Help

**In the app:**
```
/help
```

**Command-line:**
```bash
./build/pace-macos-arm64 --help
```

**Makefile commands:**
```bash
make help
```

## Distribution

Once built, you can share just the binary file with others:
- No Node.js required
- No npm install needed
- Just download and run!

Example for macOS users:
```bash
# Build
make build-macos

# Share the file
# - Upload build/pace-macos-arm64 to GitHub releases
# - Users download and run it directly
# - No installation needed!
```
