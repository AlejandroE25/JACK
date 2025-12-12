package ui

// MinimalLayout implements the minimalist chat-focused layout strategy
type MinimalLayout struct{}

// NewMinimalLayout creates a new minimal layout strategy
func NewMinimalLayout() *MinimalLayout {
	return &MinimalLayout{}
}

// Calculate computes the minimal layout with full-width conversation
func (m *MinimalLayout) Calculate(width, height int) *Layout {
	layout := &Layout{
		Width:  width,
		Height: height,
	}

	// Header: 1 row (compact status line)
	layout.HeaderStartY = 0
	layout.HeaderHeight = 1

	// Input: 3 rows at bottom
	layout.InputHeight = 3
	layout.InputStartY = height - layout.InputHeight

	// Content area: everything between header and input
	layout.ContentStartY = layout.HeaderHeight
	layout.ContentHeight = layout.InputStartY - layout.ContentStartY

	// Full-width conversation panel (no side panels)
	layout.ConvStartX = 0
	layout.ConvWidth = width

	// No info panels in minimal mode
	layout.InfoStartX = 0
	layout.InfoWidth = 0

	// No weather panel
	layout.WeatherStartY = 0
	layout.WeatherHeight = 0

	// No news panel
	layout.NewsStartY = 0
	layout.NewsHeight = 0

	return layout
}

// GetMode returns the layout mode
func (m *MinimalLayout) GetMode() LayoutMode {
	return LayoutModeMinimal
}

// ShouldRenderWeather returns false for minimal mode
func (m *MinimalLayout) ShouldRenderWeather() bool {
	return false
}

// ShouldRenderNews returns false for minimal mode
func (m *MinimalLayout) ShouldRenderNews() bool {
	return false
}

// GetHelpText returns help text for the status bar
func (m *MinimalLayout) GetHelpText() string {
	return "[Ctrl+T: Toggle] [/weather: Quick Info] [/help: Commands]"
}
