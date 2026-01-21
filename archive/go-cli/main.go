package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/AlejandroE25/proPACE/go-cli/internal/client"
	"github.com/AlejandroE25/proPACE/go-cli/internal/config"
	"github.com/AlejandroE25/proPACE/go-cli/internal/input"
	"github.com/AlejandroE25/proPACE/go-cli/internal/managers"
	"github.com/AlejandroE25/proPACE/go-cli/internal/ui"
	"github.com/AlejandroE25/proPACE/go-cli/pkg/protocol"
)

// App is the main application struct
type App struct {
	config   *config.Config
	client   *client.Client
	renderer *ui.Renderer
	input    *input.Handler

	// Managers
	timeMgr *managers.TimeManager
	weatherMgr *managers.WeatherManager
	newsMgr    *managers.NewsManager
	convMgr    *managers.ConversationManager

	// UI state
	state *ui.UIState

	// Coordination
	stop chan bool
}

// NewApp creates a new App instance
func NewApp(cfg *config.Config) *App {
	// Create client
	wsClient := client.New(
		cfg.Host,
		cfg.Port,
		cfg.ReconnectDelay,
		cfg.MaxReconnectDelay,
	)

	// Create managers
	timeMgr := managers.NewTimeManager(cfg.TimeRefreshInterval)
	weatherMgr := managers.NewWeatherManager(wsClient, cfg.WeatherRefreshInterval)
	newsMgr := managers.NewNewsManager(wsClient, cfg.NewsRefreshInterval)
	convMgr := managers.NewConversationManager(cfg.MessageTimeout)

	// Create renderer with the configured mode
	mode := ui.ParseLayoutMode(cfg.UIMode)
	renderer := ui.NewRendererWithMode(mode)

	// Create input handler
	inputHandler := input.New()

	return &App{
		config:     cfg,
		client:     wsClient,
		renderer:   renderer,
		input:      inputHandler,
		timeMgr:    timeMgr,
		weatherMgr: weatherMgr,
		newsMgr:    newsMgr,
		convMgr:    convMgr,
		state: &ui.UIState{
			ConnState:  client.StateDisconnected,
			LayoutMode: mode,
		},
		stop: make(chan bool),
	}
}

// Start starts the application
func (a *App) Start() error {
	// Clear screen and initial render
	a.renderer.Clear()
	a.renderer.Render(a.state)

	// Start managers (before connecting)
	a.timeMgr.Start()
	a.weatherMgr.Start()
	a.newsMgr.Start()

	// Start input handler
	err := a.input.Start()
	if err != nil {
		return fmt.Errorf("failed to start input handler: %w", err)
	}

	// Try to connect to server (non-blocking)
	log.Println("Connecting to server...")
	err = a.client.Connect()
	if err != nil {
		// Don't fail - just log and continue
		// The client will auto-reconnect in the background
		log.Printf("Initial connection failed: %v", err)
		log.Println("Will retry in background...")

		// Trigger reconnection in background
		go a.client.Reconnect()
	}

	// Setup signal handling
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start event loop
	go a.eventLoop()

	// Wait for shutdown signal
	<-sigChan
	a.Shutdown()

	return nil
}

// eventLoop is the main event coordination loop
func (a *App) eventLoop() {
	for {
		select {
		case <-a.client.Connected():
			// Client connected - fetch initial data
			log.Println("Connected to server, fetching initial data...")
			a.weatherMgr.Fetch()
			a.newsMgr.Fetch()
			a.state.ConnState = a.client.State()
			a.renderer.Render(a.state)

		case msg := <-a.client.Messages():
			a.handleMessage(msg)

		case timeData := <-a.timeMgr.Updates():
			a.state.Time = timeData
			// Only update header to avoid flickering
			a.renderer.RenderHeaderOnly(a.state)

		case weatherData := <-a.weatherMgr.Updates():
			a.state.Weather = weatherData
			a.renderer.Render(a.state)

		case newsData := <-a.newsMgr.Updates():
			a.state.News = newsData
			a.renderer.Render(a.state)

		case convData := <-a.convMgr.Updates():
			a.state.Conversation = convData
			a.renderer.Render(a.state)

		case cmd := <-a.input.Commands():
			a.handleCommand(cmd)

		case msg := <-a.input.Messages():
			a.handleUserMessage(msg)

		case err := <-a.client.Errors():
			log.Printf("Client error: %v", err)

		case <-a.stop:
			return
		}

		// Update connection state
		a.state.ConnState = a.client.State()
	}
}

// handleMessage handles incoming WebSocket messages
func (a *App) handleMessage(msg *protocol.Message) {
	queryLower := strings.ToLower(msg.Query)

	// Check if this is an automatic fetch query (don't show in conversation)
	isAutoFetch := msg.Query == "What's the weather?" || msg.Query == "What's the news?"

	// Update specialized panels if applicable
	if strings.Contains(queryLower, "weather") {
		a.weatherMgr.ProcessResponse(msg.Response)
		// Only show in conversation if user asked (not auto-fetch)
		if !isAutoFetch {
			a.convMgr.SetResponse(msg.Response)
		}
	} else if strings.Contains(queryLower, "news") {
		a.newsMgr.ProcessResponse(msg.Response)
		// Only show in conversation if user asked (not auto-fetch)
		if !isAutoFetch {
			a.convMgr.SetResponse(msg.Response)
		}
	} else {
		// Regular conversation - always update
		a.convMgr.SetResponse(msg.Response)
	}
}

// handleCommand handles user commands
func (a *App) handleCommand(cmd input.Command) {
	switch cmd {
	case input.CmdQuit:
		a.Shutdown()

	case input.CmdClear:
		a.convMgr.Clear()

	case input.CmdRefresh:
		a.weatherMgr.Fetch()
		a.newsMgr.Fetch()

	case input.CmdHelp:
		a.showHelp()

	case input.CmdNextHeadline:
		a.newsMgr.Next()

	case input.CmdPrevHeadline:
		a.newsMgr.Previous()

	case input.CmdModeDashboard:
		a.switchLayoutMode(ui.LayoutModeDashboard)

	case input.CmdModeMinimal:
		a.switchLayoutMode(ui.LayoutModeMinimal)

	case input.CmdModeToggle:
		if a.state.LayoutMode == ui.LayoutModeDashboard {
			a.switchLayoutMode(ui.LayoutModeMinimal)
		} else {
			a.switchLayoutMode(ui.LayoutModeDashboard)
		}
	}
}

// handleUserMessage handles user messages
func (a *App) handleUserMessage(message string) {
	if !a.client.IsConnected() {
		a.convMgr.SetQuery("Not connected")
		a.convMgr.SetResponse("Cannot send message: not connected to server")
		return
	}

	// Set query and mark as processing
	a.convMgr.SetQuery(message)

	// Send to server
	err := a.client.Send(message)
	if err != nil {
		a.convMgr.SetResponse(fmt.Sprintf("Error sending message: %v", err))
	}
}

// switchLayoutMode switches to a different layout mode
func (a *App) switchLayoutMode(mode ui.LayoutMode) {
	// Update state
	a.state.LayoutMode = mode

	// Update renderer
	a.renderer.SetLayoutMode(mode)

	// Pause/resume managers based on mode
	if mode == ui.LayoutModeMinimal {
		// In minimal mode, pause weather and news auto-updates
		a.weatherMgr.Pause()
		a.newsMgr.Pause()
	} else {
		// In dashboard mode, resume auto-updates
		a.weatherMgr.Resume()
		a.newsMgr.Resume()
	}

	// Re-render with new layout
	a.renderer.Render(a.state)

	// Save mode to config
	err := a.config.SaveUIMode(mode.String())
	if err != nil {
		log.Printf("Warning: failed to save UI mode: %v", err)
	}
}

// showHelp displays help information
func (a *App) showHelp() {
	helpText := `Available commands:
/quit, /exit - Exit the application
/clear - Clear conversation
/refresh - Force refresh weather and news
/help - Show this help message
/dashboard, /dash - Switch to dashboard mode
/minimal, /min - Switch to minimal mode
/toggle - Toggle between modes

Keyboard Shortcuts:
Ctrl+D - Dashboard mode
Ctrl+T - Toggle between modes
→ - Next news headline
← - Previous news headline

Just type your message and press Enter to chat with PACE!`

	a.convMgr.SetQuery("/help")
	a.convMgr.SetResponse(helpText)
}

// Shutdown gracefully shuts down the application
func (a *App) Shutdown() {
	log.Println("Shutting down...")

	// Stop event loop
	close(a.stop)

	// Stop managers
	a.timeMgr.Stop()
	a.weatherMgr.Stop()
	a.newsMgr.Stop()

	// Close client
	a.client.Close()

	// Close input handler
	a.input.Close()

	// Clear screen and show goodbye message
	a.renderer.Clear()
	fmt.Println("Thanks for using PACE Terminal! Goodbye.")

	os.Exit(0)
}

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		os.Exit(1)
	}

	// Check if we need to show the startup menu
	if cfg.UIMode == "" && !cfg.HasModeFlagOverride() {
		selectedMode := ui.ShowLayoutSelectionMenu()
		err = cfg.SaveUIMode(selectedMode)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to save UI mode: %v\n", err)
		}
	}

	// Create and start app
	app := NewApp(cfg)

	err = app.Start()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error starting app: %v\n", err)
		os.Exit(1)
	}
}
