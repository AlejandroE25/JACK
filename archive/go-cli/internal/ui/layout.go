package ui

// Layout represents the calculated layout for all panels
type Layout struct {
	// Terminal dimensions
	Width  int
	Height int

	// Header panel
	HeaderStartY int
	HeaderHeight int

	// Content area (conversation + info panels)
	ContentStartY int
	ContentHeight int

	// Conversation panel (left side)
	ConvStartX int
	ConvWidth  int

	// Info panels (right side)
	InfoStartX int
	InfoWidth  int

	// Weather panel (top right)
	WeatherStartY int
	WeatherHeight int

	// News panel (bottom right)
	NewsStartY int
	NewsHeight int

	// Input panel (bottom)
	InputStartY int
	InputHeight int
}

// CalculateLayout calculates panel positions and sizes
func CalculateLayout(width, height int) *Layout {
	layout := &Layout{
		Width:  width,
		Height: height,
	}

	// Header: 8 rows (logo + metadata)
	layout.HeaderStartY = 0
	layout.HeaderHeight = 8

	// Input: 3 rows at bottom
	layout.InputHeight = 3
	layout.InputStartY = height - layout.InputHeight

	// Content area: everything between header and input
	layout.ContentStartY = layout.HeaderHeight
	layout.ContentHeight = layout.InputStartY - layout.ContentStartY

	// Split content horizontally: 50% conversation, 50% info
	layout.ConvStartX = 0
	layout.ConvWidth = width / 2

	layout.InfoStartX = layout.ConvWidth
	layout.InfoWidth = width - layout.ConvWidth

	// Split info panels vertically: 30% weather, 70% news
	layout.WeatherStartY = layout.ContentStartY
	layout.WeatherHeight = layout.ContentHeight * 30 / 100

	layout.NewsStartY = layout.WeatherStartY + layout.WeatherHeight
	layout.NewsHeight = layout.ContentHeight - layout.WeatherHeight

	return layout
}
