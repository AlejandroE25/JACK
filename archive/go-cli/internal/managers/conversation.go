package managers

import (
	"strings"
	"sync"
	"time"
)

// ConversationData represents conversation state
type ConversationData struct {
	Query          string
	Response       string
	FullResponse   string // Complete response for proper markdown parsing
	Processing     bool
	ScrollOffset   int  // For auto-scrolling long responses
	IsFullyTyped   bool // Whether typewriter effect is complete
	LoadingFrame   int  // Current frame of loading animation
}

// ConversationManager manages conversation state
type ConversationManager struct {
	data    ConversationData
	mu      sync.RWMutex
	timeout time.Duration

	updates       chan ConversationData
	stopAnimation chan bool
}

// NewConversationManager creates a new ConversationManager
func NewConversationManager(timeout time.Duration) *ConversationManager {
	return &ConversationManager{
		timeout:       timeout,
		updates:       make(chan ConversationData, 1),
		stopAnimation: make(chan bool, 1),
	}
}

// SetQuery sets the current query and marks as processing
func (cm *ConversationManager) SetQuery(query string) {
	cm.mu.Lock()
	cm.data.Query = query
	cm.data.Response = ""
	cm.data.Processing = true
	cm.data.LoadingFrame = 0
	cm.mu.Unlock()

	cm.sendUpdate()

	// Start loading animation
	go cm.startLoadingAnimation()

	// Start timeout timer
	go cm.startTimeout()
}

// startLoadingAnimation animates a loading indicator while processing
func (cm *ConversationManager) startLoadingAnimation() {
	// Spinner frames using Braille characters for smooth animation
	spinners := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

	// Loading messages that cycle with spinner
	loadingStates := []string{
		"Thinking",
		"Processing",
		"Analyzing",
		"Searching",
	}

	loadingMessages := make([]string, 0)

	// Generate combinations with dot animation
	for _, state := range loadingStates {
		for i := 0; i <= 3; i++ {
			dots := strings.Repeat(".", i)
			loadingMessages = append(loadingMessages, state+dots)
		}
	}

	ticker := time.NewTicker(150 * time.Millisecond)
	defer ticker.Stop()

	frame := 0
	for {
		select {
		case <-ticker.C:
			cm.mu.Lock()
			if !cm.data.Processing {
				cm.mu.Unlock()
				return
			}
			cm.data.LoadingFrame = frame

			// Combine spinner with message
			spinnerIdx := frame % len(spinners)
			msgIdx := (frame / len(spinners)) % len(loadingMessages)
			cm.data.Response = spinners[spinnerIdx] + " " + loadingMessages[msgIdx]

			cm.mu.Unlock()
			cm.sendUpdate()
			frame++

		case <-cm.stopAnimation:
			return
		}
	}
}

// SetResponse sets the response with typewriter effect
func (cm *ConversationManager) SetResponse(response string) {
	// Stop loading animation
	select {
	case cm.stopAnimation <- true:
	default:
	}

	cm.mu.Lock()
	cm.data.Response = ""
	cm.data.FullResponse = response
	cm.data.Processing = true
	cm.data.IsFullyTyped = false
	cm.mu.Unlock()

	// Stream response character by character
	go cm.streamResponse(response)
}

// streamResponse streams the response with typewriter effect
func (cm *ConversationManager) streamResponse(fullResponse string) {
	// Type at ~100 characters per second (10ms per char)
	charDelay := 10 * time.Millisecond

	for i := range fullResponse {
		cm.mu.Lock()
		cm.data.Response = fullResponse[:i+1]
		cm.mu.Unlock()
		cm.sendUpdate()

		time.Sleep(charDelay)
	}

	// Mark as complete
	cm.mu.Lock()
	cm.data.Response = fullResponse
	cm.data.Processing = false
	cm.data.IsFullyTyped = true
	cm.mu.Unlock()
	cm.sendUpdate()
}

// Clear clears the conversation
func (cm *ConversationManager) Clear() {
	// Stop any running animations
	select {
	case cm.stopAnimation <- true:
	default:
	}

	cm.mu.Lock()
	defer cm.mu.Unlock()

	cm.data.Query = ""
	cm.data.Response = ""
	cm.data.Processing = false
	cm.data.LoadingFrame = 0

	cm.sendUpdate()
}

// startTimeout sets a timeout for the current query
func (cm *ConversationManager) startTimeout() {
	time.Sleep(cm.timeout)

	// Stop any running animations
	select {
	case cm.stopAnimation <- true:
	default:
	}

	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Only set timeout message if still processing
	if cm.data.Processing {
		cm.data.Response = "Request timed out. Please try again."
		cm.data.Processing = false
		cm.sendUpdate()
	}
}

// sendUpdate sends current conversation data to the updates channel
func (cm *ConversationManager) sendUpdate() {
	data := cm.data

	select {
	case cm.updates <- data:
	default:
	}
}

// Updates returns the channel for receiving conversation updates
func (cm *ConversationManager) Updates() <-chan ConversationData {
	return cm.updates
}

// GetData returns the current conversation data
func (cm *ConversationManager) GetData() ConversationData {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.data
}

// IsProcessing returns true if currently processing a query
func (cm *ConversationManager) IsProcessing() bool {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.data.Processing
}
