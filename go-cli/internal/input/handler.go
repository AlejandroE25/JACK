package input

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"golang.org/x/term"
)

// Command represents a user command
type Command int

const (
	CmdQuit Command = iota
	CmdClear
	CmdRefresh
	CmdHelp
	CmdNextHeadline
	CmdPrevHeadline
	CmdModeDashboard
	CmdModeMinimal
	CmdModeToggle
)

// Handler manages user input
type Handler struct {
	oldState *term.State

	commands chan Command
	messages chan string
	stop     chan bool
}

// New creates a new input handler
func New() *Handler {
	return &Handler{
		commands: make(chan Command, 10),
		messages: make(chan string, 10),
		stop:     make(chan bool),
	}
}

// Start begins handling input
func (h *Handler) Start() error {
	// Put terminal in raw mode to capture arrow keys
	var err error
	h.oldState, err = term.MakeRaw(int(os.Stdin.Fd()))
	if err != nil {
		// Fallback to cooked mode if raw mode fails
		return h.startCookedMode()
	}

	go h.readRawInput()
	return nil
}

// startCookedMode starts input handling in cooked mode (fallback)
func (h *Handler) startCookedMode() error {
	go h.readCookedInput()
	return nil
}

// readCookedInput reads input in cooked mode (line-buffered)
func (h *Handler) readCookedInput() {
	scanner := bufio.NewScanner(os.Stdin)

	for scanner.Scan() {
		select {
		case <-h.stop:
			return
		default:
		}

		line := strings.TrimSpace(scanner.Text())
		h.processInput(line)
	}
}

// readRawInput reads input in raw mode (character-by-character)
func (h *Handler) readRawInput() {
	buf := make([]byte, 1)
	var currentInput strings.Builder

	// Track cursor position for proper input display
	inputX := 2 // Starting position after "> "

	for {
		select {
		case <-h.stop:
			return
		default:
		}

		n, err := os.Stdin.Read(buf)
		if err != nil || n == 0 {
			continue
		}

		ch := buf[0]

		// Handle special keys
		switch ch {
		case 3: // Ctrl+C
			h.commands <- CmdQuit
			return

		case 4: // Ctrl+D - Switch to dashboard mode
			h.commands <- CmdModeDashboard
			continue

		case 10, 13: // Enter/Return (both LF and CR)
			line := strings.TrimSpace(currentInput.String())
			if line != "" {
				// Clear the input line visually
				fmt.Print("\r> " + strings.Repeat(" ", currentInput.Len()) + "\r> ")
				h.processInput(line)
			}
			currentInput.Reset()
			inputX = 2

		case 20: // Ctrl+T - Toggle between modes
			h.commands <- CmdModeToggle
			continue

		case 127, 8: // Backspace/Delete
			if currentInput.Len() > 0 {
				s := currentInput.String()
				currentInput.Reset()
				currentInput.WriteString(s[:len(s)-1])
				inputX--
				// Clear the character and move cursor back
				fmt.Print("\b \b")
			}

		case 27: // Escape sequence (arrow keys)
			// Read next two bytes for arrow key
			buf2 := make([]byte, 2)
			n, _ := os.Stdin.Read(buf2)
			if n == 2 && buf2[0] == '[' {
				switch buf2[1] {
				case 'C': // Right arrow
					h.commands <- CmdNextHeadline
				case 'D': // Left arrow
					h.commands <- CmdPrevHeadline
				}
			}

		default:
			// Regular character
			if ch >= 32 && ch < 127 {
				currentInput.WriteByte(ch)
				inputX++
				// Echo the character
				fmt.Printf("%c", ch)
			}
		}
	}
}

// processInput processes a line of input
func (h *Handler) processInput(line string) {
	if line == "" {
		return
	}

	// Check if it's a command
	if strings.HasPrefix(line, "/") {
		cmd := strings.ToLower(line)

		switch cmd {
		case "/quit", "/exit":
			h.commands <- CmdQuit
		case "/clear":
			h.commands <- CmdClear
		case "/refresh":
			h.commands <- CmdRefresh
		case "/help":
			h.commands <- CmdHelp
		case "/dashboard", "/dash":
			h.commands <- CmdModeDashboard
		case "/minimal", "/min":
			h.commands <- CmdModeMinimal
		case "/mode toggle", "/toggle":
			h.commands <- CmdModeToggle
		default:
			// Unknown command
			fmt.Printf("\r\nUnknown command: %s\r\n", line)
		}
		return
	}

	// Regular message
	select {
	case h.messages <- line:
	default:
		// Channel full
	}
}

// Commands returns the channel for receiving commands
func (h *Handler) Commands() <-chan Command {
	return h.commands
}

// Messages returns the channel for receiving messages
func (h *Handler) Messages() <-chan string {
	return h.messages
}

// Close closes the input handler and restores terminal state
func (h *Handler) Close() error {
	close(h.stop)

	if h.oldState != nil {
		return term.Restore(int(os.Stdin.Fd()), h.oldState)
	}

	return nil
}
