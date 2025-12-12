package ui

import (
	"fmt"
	"os"

	"github.com/AlejandroE25/proPACE/go-cli/internal/client"
	"github.com/AlejandroE25/proPACE/go-cli/internal/managers"
)

// UIState holds all data needed for rendering
type UIState struct {
	Time         managers.TimeData
	Weather      managers.WeatherData
	News         managers.NewsData
	Conversation managers.ConversationData
	ConnState    client.ConnectionState
	LayoutMode   LayoutMode // Current layout mode
}

// Renderer manages terminal rendering
type Renderer struct {
	caps     *TerminalCapabilities
	layout   *Layout
	strategy LayoutStrategy // Layout strategy for current mode
}

// NewRenderer creates a new Renderer with dashboard mode as default
func NewRenderer() *Renderer {
	caps := DetectCapabilities()
	strategy := NewDashboardLayout()
	layout := strategy.Calculate(caps.Width, caps.Height)

	return &Renderer{
		caps:     caps,
		layout:   layout,
		strategy: strategy,
	}
}

// NewRendererWithMode creates a new Renderer with a specific mode
func NewRendererWithMode(mode LayoutMode) *Renderer {
	caps := DetectCapabilities()
	var strategy LayoutStrategy

	switch mode {
	case LayoutModeMinimal:
		strategy = NewMinimalLayout()
	default:
		strategy = NewDashboardLayout()
	}

	layout := strategy.Calculate(caps.Width, caps.Height)

	return &Renderer{
		caps:     caps,
		layout:   layout,
		strategy: strategy,
	}
}

// SetLayoutMode switches the renderer to a different layout mode
func (r *Renderer) SetLayoutMode(mode LayoutMode) {
	switch mode {
	case LayoutModeMinimal:
		r.strategy = NewMinimalLayout()
	default:
		r.strategy = NewDashboardLayout()
	}

	// Recalculate layout with new strategy
	r.layout = r.strategy.Calculate(r.caps.Width, r.caps.Height)
}

// Render renders the complete UI
func (r *Renderer) Render(state *UIState) {
	// Clear screen and move cursor to home
	fmt.Print(ClearScreen + CursorHome)

	// Update layout if terminal size changed
	r.caps.UpdateSize()
	r.layout = r.strategy.Calculate(r.caps.Width, r.caps.Height)

	// Render header (mode-aware)
	fmt.Print(RenderHeader(r.layout, r.caps, state.Time, state.ConnState, r.strategy.GetMode()))

	// Render conversation panel (always visible)
	fmt.Print(RenderConversation(r.layout, r.caps, state.Conversation))

	// Render info panels only if strategy says so
	if r.strategy.ShouldRenderWeather() {
		fmt.Print(RenderWeather(r.layout, r.caps, state.Weather))
	}

	if r.strategy.ShouldRenderNews() {
		fmt.Print(RenderNews(r.layout, r.caps, state.News))
	}

	// Render input panel with mode-specific help text
	fmt.Print(RenderInput(r.layout, r.strategy.GetHelpText()))
}

// RenderHeaderOnly renders only the header (for time updates)
// This doesn't clear the screen, so user input is preserved
func (r *Renderer) RenderHeaderOnly(state *UIState) {
	// Use DECSC (save cursor) - more widely supported
	fmt.Print("\0337")
	os.Stdout.Sync() // Flush before rendering

	// Render just the header
	fmt.Print(RenderHeader(r.layout, r.caps, state.Time, state.ConnState, r.strategy.GetMode()))
	os.Stdout.Sync() // Flush after rendering

	// Use DECRC (restore cursor)
	fmt.Print("\0338")
	os.Stdout.Sync() // Ensure restore is sent
}

// Clear clears the screen
func (r *Renderer) Clear() {
	fmt.Print(ClearScreen + CursorHome)
}

// GetCapabilities returns the terminal capabilities
func (r *Renderer) GetCapabilities() *TerminalCapabilities {
	return r.caps
}
