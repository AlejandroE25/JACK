package ui

// LayoutMode represents different UI layout modes
type LayoutMode int

const (
	LayoutModeDashboard LayoutMode = iota
	LayoutModeMinimal
)

// String returns the string representation of the layout mode
func (m LayoutMode) String() string {
	switch m {
	case LayoutModeDashboard:
		return "dashboard"
	case LayoutModeMinimal:
		return "minimal"
	default:
		return "unknown"
	}
}

// ParseLayoutMode parses a string into a LayoutMode
func ParseLayoutMode(s string) LayoutMode {
	switch s {
	case "minimal", "min":
		return LayoutModeMinimal
	case "dashboard", "dash":
		return LayoutModeDashboard
	default:
		return LayoutModeDashboard // Default to dashboard
	}
}

// LayoutStrategy defines the interface for different layout modes
type LayoutStrategy interface {
	// Calculate computes the layout based on terminal dimensions
	Calculate(width, height int) *Layout

	// GetMode returns the layout mode
	GetMode() LayoutMode

	// ShouldRenderWeather returns true if weather panel should be rendered
	ShouldRenderWeather() bool

	// ShouldRenderNews returns true if news panel should be rendered
	ShouldRenderNews() bool

	// GetHelpText returns mode-specific help text for the status bar
	GetHelpText() string
}
