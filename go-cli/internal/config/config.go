package config

import (
	"flag"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all configuration for the CLI client
type Config struct {
	// WebSocket connection
	Host string
	Port int

	// Reconnection settings
	ReconnectDelay    time.Duration
	MaxReconnectDelay time.Duration

	// Manager refresh intervals
	WeatherRefreshInterval time.Duration
	NewsRefreshInterval    time.Duration
	TimeRefreshInterval    time.Duration

	// Timeouts
	MessageTimeout time.Duration

	// UI settings
	UIMode         string // "dashboard" or "minimal"
	RememberUIMode bool   // Persist mode across sessions

	// File config reference
	fileConfig *FileConfig
	configPath string

	// Flag tracking
	hasModeFlagOverride bool
}

// Load creates a Config from command-line flags and environment variables
func Load() (*Config, error) {
	cfg := &Config{
		// Defaults
		Host:                   "localhost",
		Port:                   9001,
		ReconnectDelay:         1 * time.Second,
		MaxReconnectDelay:      30 * time.Second,
		WeatherRefreshInterval: 15 * time.Minute,
		NewsRefreshInterval:    60 * time.Minute,
		TimeRefreshInterval:    1 * time.Second,
		MessageTimeout:         30 * time.Second,
		RememberUIMode:         true,
	}

	// Command-line flags
	host := flag.String("host", "", "WebSocket server host")
	port := flag.Int("port", 0, "WebSocket server port")
	mode := flag.String("mode", "", "UI mode: dashboard or minimal")
	interactive := flag.Bool("interactive", false, "Force layout selection menu")
	help := flag.Bool("help", false, "Show help message")
	flag.BoolVar(help, "h", false, "Show help message (shorthand)")

	flag.Parse()

	if *help {
		printHelp()
		os.Exit(0)
	}

	// Load file config
	fileConfig, err := LoadFromFile()
	if err != nil {
		// Non-fatal: continue with defaults
		fmt.Fprintf(os.Stderr, "Warning: could not load config file: %v\n", err)
		fileConfig = defaultFileConfig()
	}
	cfg.fileConfig = fileConfig

	// Apply file config
	if fileConfig.Connection.Host != "" {
		cfg.Host = fileConfig.Connection.Host
	}
	if fileConfig.Connection.Port != 0 {
		cfg.Port = fileConfig.Connection.Port
	}
	cfg.UIMode = fileConfig.UI.Mode
	cfg.RememberUIMode = fileConfig.UI.RememberMode

	// Environment variables override file config
	if envHost := os.Getenv("PACE_HOST"); envHost != "" {
		cfg.Host = envHost
	}

	if envPort := os.Getenv("PACE_PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			cfg.Port = p
		}
	}

	if envMode := os.Getenv("PACE_UI_MODE"); envMode != "" {
		cfg.UIMode = envMode
	}

	// Command-line flags override environment variables
	if *host != "" {
		cfg.Host = *host
	}

	if *port != 0 {
		cfg.Port = *port
	}

	if *mode != "" {
		cfg.UIMode = *mode
		cfg.hasModeFlagOverride = true
	}

	// Interactive flag forces menu
	if *interactive {
		cfg.UIMode = "" // Clear mode to trigger menu
	}

	return cfg, nil
}

// SaveUIMode persists the UI mode to the config file
func (c *Config) SaveUIMode(mode string) error {
	if !c.RememberUIMode {
		return nil // Don't save if user disabled persistence
	}

	if c.fileConfig == nil {
		c.fileConfig = defaultFileConfig()
	}

	c.fileConfig.UI.Mode = mode
	c.UIMode = mode

	return SaveToFile(c.fileConfig)
}

// HasModeFlagOverride returns true if --mode flag was provided
func (c *Config) HasModeFlagOverride() bool {
	return c.hasModeFlagOverride
}

func printHelp() {
	fmt.Println(`PACE Terminal Client (Go)

Usage: pace-cli [options]

Options:
  --host <host>      WebSocket server host (default: localhost)
  --port <port>      WebSocket server port (default: 9001)
  --mode <mode>      UI mode: dashboard or minimal
  --interactive      Force layout selection menu
  --help, -h         Show this help message

Environment Variables:
  PACE_HOST          WebSocket server host
  PACE_PORT          WebSocket server port
  PACE_UI_MODE       UI mode: dashboard or minimal

Layout Modes:
  Dashboard          Multi-panel layout with weather, news, and chat
  Minimal            Full-width chat-focused interface

  Toggle modes with Ctrl+D (dashboard) or Ctrl+M (minimal)

Commands (in terminal):
  /quit, /exit       Exit the application
  /clear             Clear conversation
  /refresh           Force refresh weather and news
  /dashboard         Switch to dashboard mode
  /minimal, /min     Switch to minimal mode
  /mode toggle       Toggle between modes
  /help              Show help in terminal

Keyboard Shortcuts:
  Ctrl+D             Switch to dashboard mode
  Ctrl+M             Switch to minimal mode
  Ctrl+T             Toggle between modes
  →                  Next news headline (dashboard mode)
  ←                  Previous news headline (dashboard mode)
`)
}
