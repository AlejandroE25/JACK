package protocol

import (
	"errors"
	"strings"
)

var (
	// ErrInvalidFormat is returned when message doesn't contain exactly one $$ delimiter
	ErrInvalidFormat = errors.New("invalid message format: must contain exactly one '$$' delimiter")
)

// Message represents a parsed WebSocket message
type Message struct {
	Query    string
	Response string
}

// Parse parses a raw WebSocket message in format "query$$response"
func Parse(raw string) (*Message, error) {
	parts := strings.Split(raw, "$$")
	if len(parts) != 2 {
		return nil, ErrInvalidFormat
	}

	return &Message{
		Query:    strings.TrimSpace(parts[0]),
		Response: strings.TrimSpace(parts[1]),
	}, nil
}

// String returns the message in wire format
func (m *Message) String() string {
	return m.Query + "$$" + m.Response
}
