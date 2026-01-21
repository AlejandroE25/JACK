package ui

import (
	"fmt"
	"os"

	"golang.org/x/term"
)

// ShowLayoutSelectionMenu displays the interactive layout selection menu
// and returns the user's choice ("dashboard" or "minimal")
func ShowLayoutSelectionMenu() string {
	// Clear screen
	fmt.Print("\033[2J\033[H")

	// Display menu
	fmt.Print(layoutSelectionScreen())

	// Set terminal to raw mode for single-key input
	oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
	if err != nil {
		// Fallback to regular input if raw mode fails
		return promptWithFallback()
	}
	defer term.Restore(int(os.Stdin.Fd()), oldState)

	// Read single key
	buf := make([]byte, 1)
	for {
		_, err := os.Stdin.Read(buf)
		if err != nil {
			term.Restore(int(os.Stdin.Fd()), oldState)
			return "dashboard" // Default on error
		}

		switch buf[0] {
		case '1':
			term.Restore(int(os.Stdin.Fd()), oldState)
			fmt.Print("\033[2J\033[H") // Clear screen
			return "dashboard"
		case '2':
			term.Restore(int(os.Stdin.Fd()), oldState)
			fmt.Print("\033[2J\033[H") // Clear screen
			return "minimal"
		case 3: // Ctrl+C
			term.Restore(int(os.Stdin.Fd()), oldState)
			fmt.Println("\nExiting...")
			os.Exit(0)
		case 27: // ESC
			term.Restore(int(os.Stdin.Fd()), oldState)
			fmt.Println("\nExiting...")
			os.Exit(0)
		}
	}
}

// layoutSelectionScreen returns the formatted menu screen
func layoutSelectionScreen() string {
	return `
┌─────────────────────────────────────────────────────────────┐
│                     Welcome to proPACE                      │
│                                                             │
│  Please select your preferred layout:                      │
│                                                             │
│  [1] Dashboard Mode                                        │
│      Multi-panel layout with weather, news, and chat       │
│      Best for: Information-rich experience                 │
│                                                             │
│  [2] Minimalist Mode                                       │
│      Full-width chat-focused interface                     │
│      Best for: Distraction-free conversations              │
│                                                             │
│  Press 1 or 2 to select (or Ctrl+C to exit)               │
│  Your choice will be saved for future sessions             │
└─────────────────────────────────────────────────────────────┘

Your choice: `
}

// promptWithFallback is a fallback for when raw mode isn't available
func promptWithFallback() string {
	var choice string
	fmt.Print("Enter 1 or 2: ")
	fmt.Scanln(&choice)

	switch choice {
	case "1":
		return "dashboard"
	case "2":
		return "minimal"
	default:
		fmt.Println("Invalid choice. Defaulting to dashboard mode.")
		return "dashboard"
	}
}
