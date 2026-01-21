package ui

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/AlejandroE25/proPACE/go-cli/internal/client"
	"github.com/AlejandroE25/proPACE/go-cli/internal/managers"
)

const (
	// ANSI colors
	ColorReset  = "\033[0m"
	ColorCyan   = "\033[36m"
	ColorGreen  = "\033[32m"
	ColorYellow = "\033[33m"
	ColorBlue   = "\033[34m"
	ColorRed    = "\033[31m"
	ColorWhite  = "\033[37m"
	ColorGray   = "\033[90m"
	ColorBold   = "\033[1m"

	// ANSI control
	ClearScreen = "\033[2J"
	CursorHome  = "\033[H"

	// Box drawing characters (Unicode)
	BoxTL = "╭" // Top-left
	BoxTR = "╮" // Top-right
	BoxBL = "╰" // Bottom-left
	BoxBR = "╯" // Bottom-right
	BoxH  = "─" // Horizontal
	BoxV  = "│" // Vertical

	// ASCII fallback
	BoxTL_ASCII = "+"
	BoxTR_ASCII = "+"
	BoxBL_ASCII = "+"
	BoxBR_ASCII = "+"
	BoxH_ASCII  = "-"
	BoxV_ASCII  = "|"
)

// moveCursor returns ANSI code to move cursor to position
func moveCursor(x, y int) string {
	return fmt.Sprintf("\033[%d;%dH", y+1, x+1)
}

// drawBox draws a box with title
func drawBox(x, y, width, height int, title, color string, caps *TerminalCapabilities) string {
	var sb strings.Builder

	// Choose box characters
	tl, tr, bl, br, h, v := BoxTL, BoxTR, BoxBL, BoxBR, BoxH, BoxV
	if !caps.SupportsUnicode {
		tl, tr, bl, br, h, v = BoxTL_ASCII, BoxTR_ASCII, BoxBL_ASCII, BoxBR_ASCII, BoxH_ASCII, BoxV_ASCII
	}

	// Top border with title
	sb.WriteString(moveCursor(x, y))
	sb.WriteString(color + tl)
	if title != "" {
		sb.WriteString(" " + title + " ")
		remaining := width - len(title) - 4
		if remaining > 0 {
			sb.WriteString(strings.Repeat(h, remaining))
		}
	} else {
		sb.WriteString(strings.Repeat(h, width-2))
	}
	sb.WriteString(tr + ColorReset)

	// Side borders
	for i := 1; i < height-1; i++ {
		sb.WriteString(moveCursor(x, y+i))
		sb.WriteString(color + v + ColorReset)
		sb.WriteString(moveCursor(x+width-1, y+i))
		sb.WriteString(color + v + ColorReset)
	}

	// Bottom border
	sb.WriteString(moveCursor(x, y+height-1))
	sb.WriteString(color + bl + strings.Repeat(h, width-2) + br + ColorReset)

	return sb.String()
}

// RenderHeader renders the header panel
func RenderHeader(layout *Layout, caps *TerminalCapabilities, timeData managers.TimeData, connState client.ConnectionState, mode LayoutMode) string {
	var sb strings.Builder

	// Status icon
	var statusIcon, statusText, statusColor string
	switch connState {
	case client.StateConnected:
		statusIcon = "●"
		statusText = "Connected"
		statusColor = ColorGreen
	case client.StateReconnecting:
		statusIcon = "⟳"
		statusText = "Reconnecting"
		statusColor = ColorYellow
	case client.StateDisconnecting:
		statusIcon = "○"
		statusText = "Disconnecting"
		statusColor = ColorYellow
	default:
		statusIcon = "○"
		statusText = "Disconnected"
		statusColor = ColorRed
	}

	if !caps.SupportsUnicode {
		switch connState {
		case client.StateConnected:
			statusIcon = "[*]"
		case client.StateReconnecting:
			statusIcon = "[~]"
		default:
			statusIcon = "[X]"
		}
	}

	// Render based on mode
	if mode == LayoutModeMinimal {
		// Minimal mode: single compact line
		sb.WriteString(moveCursor(0, 0))

		// Mode badge
		modeBadge := "[MINIMAL]"
		modeColor := ColorGreen

		// Left side: brand and mode
		sb.WriteString(ColorBold + ColorWhite + "proPACE v2.0" + ColorReset)
		sb.WriteString("      ")
		sb.WriteString(ColorWhite + timeData.Time + " | " + timeData.Date + ColorReset)

		// Right side: connection status and mode badge
		rightText := statusIcon + " " + statusText + "   " + modeBadge
		rightX := layout.Width - len(rightText) - 15 // Account for ANSI codes
		sb.WriteString(moveCursor(rightX, 0))
		sb.WriteString(statusColor + statusIcon + " " + statusText + ColorReset)
		sb.WriteString("   ")
		sb.WriteString(modeColor + modeBadge + ColorReset)

		// Draw separator line
		sb.WriteString(moveCursor(0, 1))
		sb.WriteString(strings.Repeat("─", layout.Width))

	} else {
		// Dashboard mode: full logo and info box
		// PACE ASCII logo (reduced from 6 to 5 lines for header optimization)
		logo := []string{
			"                      ____  ___   ____________",
			"    ____  _________  / __ \\/   | / ____/ ____/",
			"   / __ \\/ ___/ __ \\/ /_/ / /| |/ /   / __/   ",
			"  / /_/ / /  / /_/ / ____/ ___ / /___/ /___   ",
			" / .___/_/   \\____/_/   /_/  |_\\____/_____/   ",
		}

		// Render logo on left
		for i, line := range logo {
			sb.WriteString(moveCursor(0, layout.HeaderStartY+i))
			sb.WriteString(ColorBold + ColorWhite + line + ColorReset)
		}

		// Info box on right (time, status, version)
		infoWidth := layout.Width / 3
		if infoWidth < 25 {
			infoWidth = 25
		}
		infoX := layout.Width - infoWidth - 2
		infoY := layout.HeaderStartY

		// Draw info box
		sb.WriteString(drawBox(infoX, infoY, infoWidth, 6, "", ColorCyan, caps))

		// Mode badge
		modeBadge := "[DASHBOARD]"
		modeColor := ColorCyan

		// Render info content
		sb.WriteString(moveCursor(infoX+2, infoY+1))
		sb.WriteString(ColorWhite + timeData.Time + ColorReset)

		sb.WriteString(moveCursor(infoX+2, infoY+2))
		sb.WriteString(ColorGray + timeData.Date + ColorReset)

		sb.WriteString(moveCursor(infoX+2, infoY+3))
		sb.WriteString(statusColor + statusIcon + " " + statusText + ColorReset)

		sb.WriteString(moveCursor(infoX+2, infoY+4))
		sb.WriteString(ColorGray + "v2.0 (Go)" + ColorReset)

		sb.WriteString(moveCursor(infoX+2, infoY+5))
		sb.WriteString(modeColor + modeBadge + ColorReset)
	}

	return sb.String()
}

// RenderConversation renders the conversation panel
func RenderConversation(layout *Layout, caps *TerminalCapabilities, convData managers.ConversationData) string {
	var sb strings.Builder

	// Panel title
	title := "💬 CONVERSATION"
	if !caps.SupportsEmoji {
		title = "[C] CONVERSATION"
	}

	// Draw box
	sb.WriteString(drawBox(
		layout.ConvStartX,
		layout.ContentStartY,
		layout.ConvWidth,
		layout.ContentHeight,
		title,
		ColorCyan,
		caps,
	))

	// Clear content area inside box
	for i := 1; i < layout.ContentHeight-1; i++ {
		sb.WriteString(moveCursor(layout.ConvStartX+1, layout.ContentStartY+i))
		sb.WriteString(strings.Repeat(" ", layout.ConvWidth-2))
	}

	// Render content inside box
	contentX := layout.ConvStartX + 2
	contentY := layout.ContentStartY + 2
	maxWidth := layout.ConvWidth - 4
	maxHeight := layout.ContentHeight - 4

	// Collect all lines to render (for auto-scrolling)
	var allLines []string
	var lineColors []string

	// Add query lines
	if convData.Query != "" {
		wrapped := wrapText(convData.Query, maxWidth-5)
		queryLines := strings.Split(wrapped, "\n")

		for i, line := range queryLines {
			if i == 0 {
				allLines = append(allLines, "You: "+line)
				lineColors = append(lineColors, ColorCyan)
			} else {
				allLines = append(allLines, "     "+line) // 5 spaces indent
				lineColors = append(lineColors, "")
			}
		}
		allLines = append(allLines, "") // Spacing
		lineColors = append(lineColors, "")
	}

	// Add response lines
	if convData.Response != "" {
		// Use full response for markdown parsing if typing is complete
		// Otherwise use the partial response for typewriter effect
		textToParse := convData.Response
		if convData.IsFullyTyped && convData.FullResponse != "" {
			textToParse = convData.FullResponse
		}

		// Parse markdown formatting
		parsed := parseMarkdown(textToParse)
		wrapped := wrapText(parsed, maxWidth-6)
		responseLines := strings.Split(wrapped, "\n")

		for i, line := range responseLines {
			if i == 0 {
				allLines = append(allLines, "PACE: "+line)
				lineColors = append(lineColors, ColorGreen)
			} else {
				allLines = append(allLines, "      "+line) // 6 spaces indent
				lineColors = append(lineColors, "")
			}
		}
	}

	// Auto-scroll: if content exceeds panel height, show last N lines
	startLine := 0
	if len(allLines) > maxHeight {
		startLine = len(allLines) - maxHeight
	}

	// Render visible lines
	for i := startLine; i < len(allLines) && (i-startLine) < maxHeight; i++ {
		y := contentY + (i - startLine)
		if y >= layout.ContentStartY+maxHeight {
			break
		}

		sb.WriteString(moveCursor(contentX, y))
		if lineColors[i] != "" {
			sb.WriteString(lineColors[i])
			sb.WriteString(allLines[i])
			sb.WriteString(ColorReset)
		} else {
			sb.WriteString(allLines[i])
		}
	}

	return sb.String()
}

// RenderWeather renders the weather panel
func RenderWeather(layout *Layout, caps *TerminalCapabilities, weatherData managers.WeatherData) string {
	var sb strings.Builder

	// Panel title
	title := "☁️  WEATHER"
	if !caps.SupportsEmoji {
		title = "[W] WEATHER"
	}

	// Draw box
	sb.WriteString(drawBox(
		layout.InfoStartX,
		layout.WeatherStartY,
		layout.InfoWidth,
		layout.WeatherHeight,
		title,
		ColorYellow,
		caps,
	))

	// Clear content area inside box
	for i := 1; i < layout.WeatherHeight-1; i++ {
		sb.WriteString(moveCursor(layout.InfoStartX+1, layout.WeatherStartY+i))
		sb.WriteString(strings.Repeat(" ", layout.InfoWidth-2))
	}

	// Render content inside box
	contentX := layout.InfoStartX + 2
	contentY := layout.WeatherStartY + 2

	if weatherData.Loading {
		sb.WriteString(moveCursor(contentX, contentY))
		sb.WriteString(ColorGray + "Loading..." + ColorReset)
		return sb.String()
	}

	// Render weather data
	if weatherData.City != "" {
		sb.WriteString(moveCursor(contentX, contentY))
		sb.WriteString(ColorBold + ColorWhite + weatherData.City + ColorReset)
		contentY++
	}

	if weatherData.Temperature != "" {
		sb.WriteString(moveCursor(contentX, contentY))
		sb.WriteString(ColorYellow + weatherData.Temperature + ColorReset)
		if weatherData.Description != "" {
			sb.WriteString(" • " + weatherData.Description)
		}
		contentY++
	}

	if weatherData.FeelsLike != "" {
		sb.WriteString(moveCursor(contentX, contentY))
		sb.WriteString("Feels like " + weatherData.FeelsLike)
		contentY++
	}

	if weatherData.LastUpdated != "" {
		contentY++
		sb.WriteString(moveCursor(contentX, contentY))
		sb.WriteString(ColorGray + "Updated: " + weatherData.LastUpdated + ColorReset)
	}

	return sb.String()
}

// RenderNews renders the news panel
func RenderNews(layout *Layout, caps *TerminalCapabilities, newsData managers.NewsData) string {
	var sb strings.Builder

	// Panel title
	title := "📰 NEWS HEADLINES"
	if !caps.SupportsEmoji {
		title = "[N] NEWS HEADLINES"
	}

	// Draw box
	sb.WriteString(drawBox(
		layout.InfoStartX,
		layout.NewsStartY,
		layout.InfoWidth,
		layout.NewsHeight,
		title,
		ColorYellow,
		caps,
	))

	// Clear content area inside box
	for i := 1; i < layout.NewsHeight-1; i++ {
		sb.WriteString(moveCursor(layout.InfoStartX+1, layout.NewsStartY+i))
		sb.WriteString(strings.Repeat(" ", layout.InfoWidth-2))
	}

	// Render content inside box
	contentX := layout.InfoStartX + 2
	contentY := layout.NewsStartY + 2
	maxWidth := layout.InfoWidth - 4
	maxLines := layout.NewsHeight - 5

	if newsData.Loading {
		sb.WriteString(moveCursor(contentX, contentY))
		sb.WriteString(ColorGray + "Loading..." + ColorReset)
		return sb.String()
	}

	// Bullet character
	bullet := "•"
	if !caps.SupportsUnicode {
		bullet = "*"
	}

	// Render headlines (up to 5)
	headlinesShown := 0
	for i, headline := range newsData.Headlines {
		if headlinesShown >= 5 || contentY >= layout.NewsStartY+maxLines {
			break
		}

		// Highlight current headline
		var prefix string
		if i == newsData.CurrentIndex {
			prefix = ColorGreen + "► " + ColorReset
		} else {
			prefix = bullet + " "
		}

		// Wrap headline text
		wrapped := wrapText(headline, maxWidth-3)
		lines := strings.Split(wrapped, "\n")

		// Render first line with prefix
		if len(lines) > 0 && contentY < layout.NewsStartY+maxLines {
			sb.WriteString(moveCursor(contentX, contentY))
			sb.WriteString(prefix + lines[0])
			contentY++
		}

		// Render remaining lines indented
		for j := 1; j < len(lines) && contentY < layout.NewsStartY+maxLines; j++ {
			sb.WriteString(moveCursor(contentX+3, contentY))
			sb.WriteString(lines[j])
			contentY++
		}

		contentY++ // Add spacing between headlines
		headlinesShown++
	}

	// Update time at bottom
	if newsData.LastUpdated != "" {
		sb.WriteString(moveCursor(contentX, layout.NewsStartY+layout.NewsHeight-2))
		sb.WriteString(ColorGray + "Updated: " + newsData.LastUpdated + ColorReset)
	}

	return sb.String()
}

// RenderInput renders the input panel
func RenderInput(layout *Layout, helpText string) string {
	var sb strings.Builder

	// Draw separator line
	sb.WriteString(moveCursor(0, layout.InputStartY))
	sb.WriteString(strings.Repeat("─", layout.Width))

	// Input prompt
	sb.WriteString(moveCursor(0, layout.InputStartY+1))
	sb.WriteString(ColorGreen + "> " + ColorReset)

	// Help text on the second line (if provided)
	if helpText != "" {
		sb.WriteString(moveCursor(0, layout.InputStartY+2))
		sb.WriteString(ColorGray + helpText + ColorReset)
	}

	// Position cursor after prompt for user input
	sb.WriteString(moveCursor(2, layout.InputStartY+1))

	return sb.String()
}

// wrapText wraps text to fit within the given width, preserving existing newlines
func wrapText(text string, width int) string {
	// Split by existing newlines first to preserve paragraph structure
	paragraphs := strings.Split(text, "\n")
	var wrappedParagraphs []string

	for _, para := range paragraphs {
		// Empty lines stay empty (paragraph breaks)
		if strings.TrimSpace(para) == "" {
			wrappedParagraphs = append(wrappedParagraphs, "")
			continue
		}

		// Wrap this paragraph
		if len(para) <= width {
			wrappedParagraphs = append(wrappedParagraphs, para)
			continue
		}

		words := strings.Fields(para)
		if len(words) == 0 {
			wrappedParagraphs = append(wrappedParagraphs, para[:width])
			continue
		}

		var lines []string
		currentLine := ""

		for _, word := range words {
			// Handle words longer than width
			if len(word) > width {
				if currentLine != "" {
					lines = append(lines, currentLine)
					currentLine = ""
				}
				// Split long word
				for len(word) > width {
					lines = append(lines, word[:width-1]+"-")
					word = word[width-1:]
				}
				currentLine = word
				continue
			}

			if currentLine == "" {
				currentLine = word
			} else if len(currentLine)+1+len(word) <= width {
				currentLine += " " + word
			} else {
				lines = append(lines, currentLine)
				currentLine = word
			}
		}

		if currentLine != "" {
			lines = append(lines, currentLine)
		}

		wrappedParagraphs = append(wrappedParagraphs, strings.Join(lines, "\n"))
	}

	return strings.Join(wrappedParagraphs, "\n")
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// countLines counts the number of lines in text
func countLines(text string) int {
	return strings.Count(text, "\n") + 1
}

// parseMarkdown converts markdown formatting to ANSI escape codes
func parseMarkdown(text string) string {
	result := text

	// Convert \n to actual newlines if they appear as literal \n
	result = strings.ReplaceAll(result, "\\n", "\n")

	// Process line by line to handle headings
	lines := strings.Split(result, "\n")
	for i, line := range lines {
		// Handle headings (## Heading)
		if strings.HasPrefix(line, "## ") {
			lines[i] = ColorBold + ColorCyan + line + ColorReset
		} else if strings.HasPrefix(line, "# ") {
			lines[i] = ColorBold + ColorYellow + line + ColorReset
		}
	}
	result = strings.Join(lines, "\n")

	// Handle **bold** (must be before single * to avoid conflicts)
	boldRegex := regexp.MustCompile(`\*\*([^*]+)\*\*`)
	result = boldRegex.ReplaceAllString(result, ColorBold+"$1"+ColorReset)

	// Handle *italic* or emphasis (we'll use cyan color)
	// This regex ensures we don't match * at the start of lines (used for lists)
	italicRegex := regexp.MustCompile(`([^\n])\*([^*\n]+)\*`)
	result = italicRegex.ReplaceAllString(result, "$1"+ColorCyan+"$2"+ColorReset)

	return result
}
