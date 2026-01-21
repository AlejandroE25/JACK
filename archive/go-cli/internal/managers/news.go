package managers

import (
	"strings"
	"sync"
	"time"

	"github.com/AlejandroE25/proPACE/go-cli/internal/client"
)

// NewsData represents news information
type NewsData struct {
	Headlines    []string
	CurrentIndex int
	LastUpdated  string
	Loading      bool
}

// NewsManager manages news data updates
type NewsManager struct {
	client   *client.Client
	ticker   *time.Ticker
	interval time.Duration

	data   NewsData
	mu     sync.RWMutex
	paused bool

	updates chan NewsData
	stop    chan bool
}

// NewNewsManager creates a new NewsManager
func NewNewsManager(c *client.Client, interval time.Duration) *NewsManager {
	return &NewsManager{
		client:   c,
		interval: interval,
		data: NewsData{
			Headlines: []string{"Loading news..."},
			Loading:   true,
		},
		updates: make(chan NewsData, 1),
		stop:    make(chan bool),
	}
}

// Start begins the news update loop
func (nm *NewsManager) Start() {
	nm.ticker = time.NewTicker(nm.interval)

	// Fetch immediately
	go nm.Fetch()

	go func() {
		for {
			select {
			case <-nm.ticker.C:
				// Only fetch if not paused
				nm.mu.RLock()
				isPaused := nm.paused
				nm.mu.RUnlock()
				if !isPaused {
					go nm.Fetch()
				}
			case <-nm.stop:
				return
			}
		}
	}()
}

// Fetch requests news data from the server
func (nm *NewsManager) Fetch() {
	// Check if client is connected
	if !nm.client.IsConnected() {
		return
	}

	// Set loading state
	nm.mu.Lock()
	nm.data.Loading = true
	nm.mu.Unlock()
	nm.sendUpdate()

	// Send news query to server
	err := nm.client.Send("What's the news?")
	if err != nil {
		nm.mu.Lock()
		nm.data.Loading = false
		nm.mu.Unlock()
		nm.sendUpdate()
	}
}

// ProcessResponse parses a news response from the server
func (nm *NewsManager) ProcessResponse(response string) {
	nm.mu.Lock()
	nm.data.Headlines = parseNewsResponse(response)
	nm.data.CurrentIndex = 0
	nm.data.LastUpdated = time.Now().Format("3:04 PM")
	nm.data.Loading = false
	data := nm.data
	nm.mu.Unlock()

	// Send update after releasing lock to avoid deadlock
	select {
	case nm.updates <- data:
	default:
	}
}

// parseNewsResponse extracts headlines from the response
func parseNewsResponse(response string) []string {
	headlines := []string{}

	// Look for common patterns
	// Pattern 1: "Here are the latest headlines: [content]"
	if strings.Contains(strings.ToLower(response), "headlines") {
		// Find the content after "headlines:"
		parts := strings.Split(response, ":")
		if len(parts) > 1 {
			content := parts[1]
			// Split by periods or newlines
			lines := strings.FieldsFunc(content, func(r rune) bool {
				return r == '.' || r == '\n'
			})

			for _, line := range lines {
				line = strings.TrimSpace(line)
				// Remove common prefixes
				line = strings.TrimPrefix(line, "- ")
				line = strings.TrimPrefix(line, "• ")
				line = strings.TrimPrefix(line, "* ")

				// Remove numbering (1., 2., etc.)
				numberRegex := strings.TrimPrefix(line, "1")
				numberRegex = strings.TrimPrefix(numberRegex, "2")
				numberRegex = strings.TrimPrefix(numberRegex, "3")
				numberRegex = strings.TrimPrefix(numberRegex, "4")
				numberRegex = strings.TrimPrefix(numberRegex, "5")
				line = strings.TrimPrefix(numberRegex, ". ")

				if line != "" && len(line) > 10 {
					headlines = append(headlines, line)
					if len(headlines) >= 5 {
						break
					}
				}
			}
		}
	}

	// Fallback: split by sentence
	if len(headlines) == 0 {
		sentences := strings.Split(response, ". ")
		for _, sentence := range sentences {
			sentence = strings.TrimSpace(sentence)
			if sentence != "" && len(sentence) > 20 {
				headlines = append(headlines, sentence)
				if len(headlines) >= 5 {
					break
				}
			}
		}
	}

	if len(headlines) == 0 {
		headlines = []string{"No news available"}
	}

	return headlines
}

// Next moves to the next headline
func (nm *NewsManager) Next() {
	nm.mu.Lock()
	defer nm.mu.Unlock()

	if len(nm.data.Headlines) == 0 {
		return
	}

	nm.data.CurrentIndex = (nm.data.CurrentIndex + 1) % len(nm.data.Headlines)
	nm.sendUpdate()
}

// Previous moves to the previous headline
func (nm *NewsManager) Previous() {
	nm.mu.Lock()
	defer nm.mu.Unlock()

	if len(nm.data.Headlines) == 0 {
		return
	}

	nm.data.CurrentIndex--
	if nm.data.CurrentIndex < 0 {
		nm.data.CurrentIndex = len(nm.data.Headlines) - 1
	}
	nm.sendUpdate()
}

// sendUpdate sends current news data to the updates channel
func (nm *NewsManager) sendUpdate() {
	nm.mu.RLock()
	data := nm.data
	nm.mu.RUnlock()

	select {
	case nm.updates <- data:
	default:
	}
}

// Updates returns the channel for receiving news updates
func (nm *NewsManager) Updates() <-chan NewsData {
	return nm.updates
}

// GetData returns the current news data
func (nm *NewsManager) GetData() NewsData {
	nm.mu.RLock()
	defer nm.mu.RUnlock()
	return nm.data
}

// GetCurrentIndex returns the current headline index
func (nm *NewsManager) GetCurrentIndex() int {
	nm.mu.RLock()
	defer nm.mu.RUnlock()
	return nm.data.CurrentIndex
}

// GetHeadlineCount returns the number of headlines
func (nm *NewsManager) GetHeadlineCount() int {
	nm.mu.RLock()
	defer nm.mu.RUnlock()
	return len(nm.data.Headlines)
}

// Pause pauses automatic news updates
func (nm *NewsManager) Pause() {
	nm.mu.Lock()
	nm.paused = true
	nm.mu.Unlock()
}

// Resume resumes automatic news updates
func (nm *NewsManager) Resume() {
	nm.mu.Lock()
	nm.paused = false
	nm.mu.Unlock()
}

// Stop stops the news manager
func (nm *NewsManager) Stop() {
	if nm.ticker != nil {
		nm.ticker.Stop()
	}
	close(nm.stop)
}
