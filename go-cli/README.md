# PACE CLI Client (Go)

A lightweight, cross-platform terminal client for proPACE v2.0, written in Go. This client provides the same features as the TypeScript CLI but with zero runtime dependencies and true cross-platform portability.

## Features

- **Zero Dependencies**: Single static binary, no Node.js or npm required
- **Cross-Platform**: Native binaries for macOS (Intel & ARM), Linux (x64 & ARM), and Windows
- **Small Footprint**: ~5-10MB binary size (vs 50MB+ Node.js pkg bundle)
- **Feature Complete**: All features from TypeScript CLI
  - Real-time conversation with PACE AI assistant
  - Live weather updates (auto-refresh every 15 minutes)
  - Latest news headlines (auto-refresh hourly)
  - Arrow key navigation for news
  - Slash commands for control
  - Auto-reconnect with exponential backoff
  - Responsive terminal UI with ANSI rendering

## Installation

### Download Pre-built Binaries

Download the appropriate binary for your platform from the releases page:

- **macOS (Intel)**: `pace-macos-x64`
- **macOS (Apple Silicon)**: `pace-macos-arm64`
- **Linux (x64)**: `pace-linux-x64`
- **Linux (ARM)**: `pace-linux-arm64`
- **Windows (x64)**: `pace-windows-x64.exe`

Make it executable (macOS/Linux):
```bash
chmod +x pace-macos-arm64
```

### Build from Source

Prerequisites:
- Go 1.21 or later

```bash
# Clone the repository
cd proPACE/go-cli

# Install dependencies
make install-deps

# Build for your platform
make build

# Or build for all platforms
make build-all
```

## Usage

### Basic Usage

```bash
# Run the client (default: localhost:9001)
./pace-macos-arm64

# Connect to custom host/port
./pace-macos-arm64 --host 192.168.1.100 --port 9001

# Show help
./pace-macos-arm64 --help
```

### Environment Variables

```bash
export PACE_HOST=192.168.1.100
export PACE_PORT=9001
./pace-macos-arm64
```

### Commands

**In-terminal commands:**
- `/quit` or `/exit` - Exit the application
- `/clear` - Clear conversation panel
- `/refresh` - Force refresh weather and news
- `/help` - Show help message

**Keyboard shortcuts:**
- `→` (Right arrow) - Next news headline
- `←` (Left arrow) - Previous news headline
- `Ctrl+C` or `Ctrl+D` - Graceful shutdown

## Terminal UI Layout

```
┌─────────────────────────────────────┐
│    PACE v2.0 ASCII Logo (6 lines)   │
│  [Time] [Status] [Version]          │
├──────────────────┬──────────────────┤
│                  │  WEATHER Panel   │
│   CONVERSATION   │  City, Temp, IL  │
│   Panel (50%)    │  Updated: HH:MM  │
│   You: [query]   │                  │
│   PACE: [reply]  ├──────────────────┤
│                  │  NEWS HEADLINES  │
│                  │  • Story 1       │
│                  │  • Story 2-5     │
│                  │  Updated: HH:MM  │
├──────────────────┴──────────────────┤
│ > [User Input]                       │
└──────────────────────────────────────┘
```

## Building

### Development

```bash
# Build for current platform
make build

# Run directly
make run

# Run tests
make test

# Clean build artifacts
make clean
```

### Cross-Compilation

```bash
# Build for all platforms
make build-all

# Build for specific platform
make build-macos
make build-linux
make build-windows

# Build static binary (Linux only, maximum compatibility)
make build-static

# Build optimized release
make build-release

# Show binary sizes
make sizes

# Generate checksums
make checksums
```

## Project Structure

```
go-cli/
├── main.go                    # Application entry point
├── go.mod                     # Go module definition
├── Makefile                   # Build automation
├── README.md                  # This file
├── internal/
│   ├── client/
│   │   └── websocket.go       # WebSocket client with auto-reconnect
│   ├── ui/
│   │   ├── renderer.go        # Main UI rendering engine
│   │   ├── layout.go          # Responsive layout calculator
│   │   ├── panels.go          # Individual panel renderers
│   │   └── terminal.go        # Terminal capability detection
│   ├── managers/
│   │   ├── time.go            # TimeManager (1s updates)
│   │   ├── weather.go         # WeatherManager (15m updates)
│   │   ├── news.go            # NewsManager (1h updates)
│   │   └── conversation.go    # ConversationManager
│   ├── input/
│   │   └── handler.go         # Input handling & command parsing
│   └── config/
│       └── config.go          # Configuration management
├── pkg/
│   └── protocol/
│       └── message.go         # Protocol message parsing
└── build/                     # Built binaries
```

## Protocol

The Go client uses the same WebSocket protocol as the TypeScript server:

**Message Format**: `query$$response`

**Connection**: WebSocket to `ws://host:port` (default: `localhost:9001`)

**No authentication required** - just connect and start chatting!

## Requirements

### Runtime
- None! Single static binary with no dependencies

### Build-time
- Go 1.21 or later
- Make (optional, for using Makefile)

## Compatibility

**Tested on:**
- macOS 13+ (Intel & Apple Silicon)
- Ubuntu 20.04+
- Windows 10+
- Raspberry Pi OS (ARM)

**Terminal support:**
- iTerm2 (recommended)
- Terminal.app
- Windows Terminal (recommended for Windows)
- GNOME Terminal
- Any ANSI-compatible terminal

**Fallbacks:**
- ASCII mode for terminals without Unicode/emoji support
- Graceful degradation for limited terminals

## Performance

- **Binary size**: ~5-10MB (compressed)
- **Memory usage**: ~10-20MB
- **Startup time**: <100ms
- **No runtime overhead** (compiled, not interpreted)

## Comparison with TypeScript CLI

| Feature | TypeScript CLI | Go CLI |
|---------|---------------|--------|
| Runtime Dependency | Node.js 20+ | None |
| Binary Size | 50MB+ | ~5-10MB |
| Installation | npm install | Download & run |
| Cross-compilation | pkg tool | Native Go |
| Startup Time | ~200ms | <100ms |
| Memory Usage | ~50MB | ~10-20MB |
| Feature Parity | ✅ | ✅ |

## Development

### Adding Features

1. **New Manager**: Add to `internal/managers/`
2. **UI Panel**: Update `internal/ui/panels.go`
3. **Command**: Add to `internal/input/handler.go`
4. **Event Handling**: Update event loop in `main.go`

### Testing

```bash
# Run all tests
make test

# Run specific package tests
go test ./internal/client/...
go test ./pkg/protocol/...
```

## Troubleshooting

### Connection Issues
- Ensure proPACE server is running: `npm run dev` (in main project)
- Check host/port: `./pace-cli --host localhost --port 9001`
- Verify firewall settings

### Terminal Display Issues
- Try a modern terminal (iTerm2, Windows Terminal)
- Check terminal size: Minimum 80x24 recommended
- Verify UTF-8 encoding: `echo $LANG` should show UTF-8

### Build Issues
- Ensure Go 1.21+ installed: `go version`
- Update dependencies: `make install-deps`
- Clean and rebuild: `make clean && make build`

## Contributing

This is part of the proPACE project. See main repository for contribution guidelines.

## License

MIT License - Same as proPACE main project

## Credits

- Built with [gorilla/websocket](https://github.com/gorilla/websocket)
- Terminal control via [golang.org/x/term](https://pkg.go.dev/golang.org/x/term)
- Part of the [proPACE](https://github.com/AlejandroE25/proPACE) project
