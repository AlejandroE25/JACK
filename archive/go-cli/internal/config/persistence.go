package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"gopkg.in/yaml.v3"
)

// FileConfig represents the structure of the YAML config file
type FileConfig struct {
	Version string `yaml:"version"`

	Connection struct {
		Host string `yaml:"host"`
		Port int    `yaml:"port"`
	} `yaml:"connection"`

	UI struct {
		Mode         string `yaml:"mode"`          // "dashboard" or "minimal"
		RememberMode bool   `yaml:"remember_mode"` // Persist mode across sessions
	} `yaml:"ui"`

	Features struct {
		AutoFetchWeather       bool `yaml:"auto_fetch_weather"`
		AutoFetchNews          bool `yaml:"auto_fetch_news"`
		NewsRefreshInterval    int  `yaml:"news_refresh_interval"`    // seconds
		WeatherRefreshInterval int  `yaml:"weather_refresh_interval"` // seconds
	} `yaml:"features"`
}

// getConfigPath returns the platform-specific config file path
func getConfigPath() (string, error) {
	var configDir string

	switch runtime.GOOS {
	case "windows":
		appData := os.Getenv("APPDATA")
		if appData == "" {
			return "", fmt.Errorf("APPDATA environment variable not set")
		}
		configDir = filepath.Join(appData, "pace")

	default: // macOS and Linux
		// Try XDG_CONFIG_HOME first (Linux standard)
		if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
			configDir = filepath.Join(xdg, "pace")
		} else {
			// Fallback to ~/.pace
			home, err := os.UserHomeDir()
			if err != nil {
				return "", fmt.Errorf("failed to get user home directory: %w", err)
			}
			configDir = filepath.Join(home, ".pace")
		}
	}

	// Ensure config directory exists
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create config directory: %w", err)
	}

	return filepath.Join(configDir, "config.yaml"), nil
}

// LoadFromFile loads configuration from the YAML file
func LoadFromFile() (*FileConfig, error) {
	configPath, err := getConfigPath()
	if err != nil {
		return nil, err
	}

	// If file doesn't exist, return default config
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return defaultFileConfig(), nil
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var cfg FileConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return &cfg, nil
}

// SaveToFile saves configuration to the YAML file
func SaveToFile(cfg *FileConfig) error {
	configPath, err := getConfigPath()
	if err != nil {
		return err
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// defaultFileConfig returns a FileConfig with default values
func defaultFileConfig() *FileConfig {
	cfg := &FileConfig{
		Version: "1.0",
	}

	cfg.Connection.Host = "localhost"
	cfg.Connection.Port = 9001

	cfg.UI.Mode = "" // Empty means not set yet - will trigger selection menu
	cfg.UI.RememberMode = true

	cfg.Features.AutoFetchWeather = true
	cfg.Features.AutoFetchNews = true
	cfg.Features.NewsRefreshInterval = 3600    // 1 hour
	cfg.Features.WeatherRefreshInterval = 900  // 15 minutes

	return cfg
}

// fileExists checks if a file exists
func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
