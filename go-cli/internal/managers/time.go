package managers

import (
	"time"
)

// TimeData represents current time information
type TimeData struct {
	Time string // HH:MM:SS AM/PM
	Date string // Mon, Jan 1, 2025
}

// TimeManager manages time updates
type TimeManager struct {
	ticker   *time.Ticker
	interval time.Duration
	updates  chan TimeData
	stop     chan bool
}

// NewTimeManager creates a new TimeManager
func NewTimeManager(interval time.Duration) *TimeManager {
	return &TimeManager{
		interval: interval,
		updates:  make(chan TimeData, 1),
		stop:     make(chan bool),
	}
}

// Start begins the time update loop
func (tm *TimeManager) Start() {
	tm.ticker = time.NewTicker(tm.interval)

	go func() {
		// Send initial update
		tm.sendUpdate()

		for {
			select {
			case <-tm.ticker.C:
				tm.sendUpdate()
			case <-tm.stop:
				return
			}
		}
	}()
}

// sendUpdate sends the current time to the updates channel
func (tm *TimeManager) sendUpdate() {
	now := time.Now()

	data := TimeData{
		Time: now.Format("3:04:05 PM"),
		Date: now.Format("Mon, Jan 2, 2006"),
	}

	// Non-blocking send
	select {
	case tm.updates <- data:
	default:
		// Channel full, skip this update
	}
}

// Updates returns the channel for receiving time updates
func (tm *TimeManager) Updates() <-chan TimeData {
	return tm.updates
}

// Stop stops the time manager
func (tm *TimeManager) Stop() {
	if tm.ticker != nil {
		tm.ticker.Stop()
	}
	close(tm.stop)
}
