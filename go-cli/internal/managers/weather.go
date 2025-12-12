package managers

import (
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/AlejandroE25/proPACE/go-cli/internal/client"
)

// WeatherData represents weather information
type WeatherData struct {
	City        string
	Temperature string
	Description string
	FeelsLike   string
	LastUpdated string
	Loading     bool
}

// WeatherManager manages weather data updates
type WeatherManager struct {
	client   *client.Client
	ticker   *time.Ticker
	interval time.Duration

	data   WeatherData
	mu     sync.RWMutex
	paused bool

	updates chan WeatherData
	stop    chan bool
}

// NewWeatherManager creates a new WeatherManager
func NewWeatherManager(c *client.Client, interval time.Duration) *WeatherManager {
	return &WeatherManager{
		client:   c,
		interval: interval,
		data: WeatherData{
			Loading: true,
		},
		updates: make(chan WeatherData, 1),
		stop:    make(chan bool),
	}
}

// Start begins the weather update loop
func (wm *WeatherManager) Start() {
	wm.ticker = time.NewTicker(wm.interval)

	// Fetch immediately
	go wm.Fetch()

	go func() {
		for {
			select {
			case <-wm.ticker.C:
				// Only fetch if not paused
				wm.mu.RLock()
				isPaused := wm.paused
				wm.mu.RUnlock()
				if !isPaused {
					go wm.Fetch()
				}
			case <-wm.stop:
				return
			}
		}
	}()
}

// Fetch requests weather data from the server
func (wm *WeatherManager) Fetch() {
	// Check if client is connected
	if !wm.client.IsConnected() {
		return
	}

	// Set loading state
	wm.mu.Lock()
	wm.data.Loading = true
	wm.mu.Unlock()
	wm.sendUpdate()

	// Send weather query to server
	err := wm.client.Send("What's the weather?")
	if err != nil {
		wm.mu.Lock()
		wm.data.Loading = false
		wm.mu.Unlock()
		wm.sendUpdate()
	}
}

// ProcessResponse parses a weather response from the server
func (wm *WeatherManager) ProcessResponse(response string) {
	wm.mu.Lock()
	wm.data = parseWeatherResponse(response)
	wm.data.LastUpdated = time.Now().Format("3:04 PM")
	wm.data.Loading = false
	data := wm.data
	wm.mu.Unlock()

	// Send update after releasing lock to avoid deadlock
	select {
	case wm.updates <- data:
	default:
	}
}

// parseWeatherResponse extracts weather data from the response
func parseWeatherResponse(response string) WeatherData {
	data := WeatherData{}

	// Extract temperature (e.g., "72°F", "72 degrees")
	tempRegex := regexp.MustCompile(`(\d+)°?F`)
	if matches := tempRegex.FindStringSubmatch(response); len(matches) > 1 {
		data.Temperature = matches[1] + "°F"
	}

	// Extract "feels like" temperature
	feelsLikeRegex := regexp.MustCompile(`feels like (\d+)°?F`)
	if matches := feelsLikeRegex.FindStringSubmatch(strings.ToLower(response)); len(matches) > 1 {
		data.FeelsLike = matches[1] + "°F"
	}

	// Extract city name (typically before a comma or "is")
	cityRegex := regexp.MustCompile(`(?:in |weather in )([A-Z][a-zA-Z\s]+?)(?:,|\.)`)
	if matches := cityRegex.FindStringSubmatch(response); len(matches) > 1 {
		data.City = strings.TrimSpace(matches[1])
	}

	// Extract weather description (sunny, cloudy, rainy, etc.)
	conditions := []string{"sunny", "cloudy", "rainy", "snowy", "clear", "overcast", "partly cloudy", "stormy"}
	responseLower := strings.ToLower(response)
	for _, condition := range conditions {
		if strings.Contains(responseLower, condition) {
			data.Description = strings.Title(condition)
			break
		}
	}

	return data
}

// sendUpdate sends current weather data to the updates channel
func (wm *WeatherManager) sendUpdate() {
	wm.mu.RLock()
	data := wm.data
	wm.mu.RUnlock()

	select {
	case wm.updates <- data:
	default:
	}
}

// Updates returns the channel for receiving weather updates
func (wm *WeatherManager) Updates() <-chan WeatherData {
	return wm.updates
}

// GetData returns the current weather data
func (wm *WeatherManager) GetData() WeatherData {
	wm.mu.RLock()
	defer wm.mu.RUnlock()
	return wm.data
}

// Pause pauses automatic weather updates
func (wm *WeatherManager) Pause() {
	wm.mu.Lock()
	wm.paused = true
	wm.mu.Unlock()
}

// Resume resumes automatic weather updates
func (wm *WeatherManager) Resume() {
	wm.mu.Lock()
	wm.paused = false
	wm.mu.Unlock()
}

// Stop stops the weather manager
func (wm *WeatherManager) Stop() {
	if wm.ticker != nil {
		wm.ticker.Stop()
	}
	close(wm.stop)
}
