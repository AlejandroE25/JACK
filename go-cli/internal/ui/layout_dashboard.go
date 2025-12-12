package ui

// DashboardLayout implements the multi-panel dashboard layout strategy
type DashboardLayout struct{}

// NewDashboardLayout creates a new dashboard layout strategy
func NewDashboardLayout() *DashboardLayout {
	return &DashboardLayout{}
}

// Calculate computes the dashboard layout with improved proportions
func (d *DashboardLayout) Calculate(width, height int) *Layout {
	layout := &Layout{
		Width:  width,
		Height: height,
	}

	// Header: 6 rows (reduced from 8 for more content space)
	layout.HeaderStartY = 0
	layout.HeaderHeight = 6

	// Input: 3 rows at bottom
	layout.InputHeight = 3
	layout.InputStartY = height - layout.InputHeight

	// Content area: everything between header and input
	layout.ContentStartY = layout.HeaderHeight
	layout.ContentHeight = layout.InputStartY - layout.ContentStartY

	// Responsive split based on terminal width
	convPercent, _ := calculateSplitRatio(width)

	// Split content horizontally: responsive conversation vs info panels
	layout.ConvStartX = 0
	layout.ConvWidth = width * convPercent / 100

	layout.InfoStartX = layout.ConvWidth
	layout.InfoWidth = width - layout.ConvWidth

	// Split info panels vertically: 35% weather, 65% news (improved from 30/70)
	layout.WeatherStartY = layout.ContentStartY
	layout.WeatherHeight = layout.ContentHeight * 35 / 100

	layout.NewsStartY = layout.WeatherStartY + layout.WeatherHeight
	layout.NewsHeight = layout.ContentHeight - layout.WeatherHeight

	return layout
}

// calculateSplitRatio returns the conversation and info panel width percentages
// based on terminal width for optimal layout on different screen sizes
func calculateSplitRatio(width int) (convPercent, infoPercent int) {
	switch {
	case width >= 160:
		// Ultra-wide: Give more space to info panels
		return 35, 65
	case width >= 120:
		// Wide: Balanced layout with slight info panel preference
		return 40, 60
	case width >= 80:
		// Standard: Equal split
		return 50, 50
	default:
		// Narrow: Prioritize conversation
		return 60, 40
	}
}

// GetMode returns the layout mode
func (d *DashboardLayout) GetMode() LayoutMode {
	return LayoutModeDashboard
}

// ShouldRenderWeather returns true for dashboard mode
func (d *DashboardLayout) ShouldRenderWeather() bool {
	return true
}

// ShouldRenderNews returns true for dashboard mode
func (d *DashboardLayout) ShouldRenderNews() bool {
	return true
}

// GetHelpText returns help text for the status bar
func (d *DashboardLayout) GetHelpText() string {
	return "[Ctrl+T: Toggle] [→/←: News] [/help: Commands]"
}
