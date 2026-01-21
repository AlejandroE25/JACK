package ui

import (
	"os"
	"strings"

	"golang.org/x/term"
)

// TerminalCapabilities holds information about terminal features
type TerminalCapabilities struct {
	Width          int
	Height         int
	SupportsColor  bool
	SupportsUnicode bool
	SupportsEmoji  bool
}

// DetectCapabilities detects terminal capabilities
func DetectCapabilities() *TerminalCapabilities {
	caps := &TerminalCapabilities{
		Width:           80,  // Default
		Height:          24,  // Default
		SupportsColor:   true, // Assume true for modern terminals
		SupportsUnicode: true, // Assume true for modern terminals
		SupportsEmoji:   true, // Assume true for modern terminals
	}

	// Get terminal size
	width, height, err := term.GetSize(int(os.Stdout.Fd()))
	if err == nil {
		caps.Width = width
		caps.Height = height
	}

	// Check TERM environment variable
	termType := os.Getenv("TERM")

	// Basic terminals don't support colors
	if termType == "dumb" || termType == "unknown" {
		caps.SupportsColor = false
		caps.SupportsUnicode = false
		caps.SupportsEmoji = false
	}

	// Check for emoji support based on terminal and locale
	lang := os.Getenv("LANG")
	if !strings.Contains(lang, "UTF-8") {
		caps.SupportsEmoji = false
		caps.SupportsUnicode = false
	}

	return caps
}

// UpdateSize updates the terminal size
func (tc *TerminalCapabilities) UpdateSize() {
	width, height, err := term.GetSize(int(os.Stdout.Fd()))
	if err == nil {
		tc.Width = width
		tc.Height = height
	}
}
