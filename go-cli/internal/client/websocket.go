package client

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/AlejandroE25/proPACE/go-cli/pkg/protocol"
	"github.com/gorilla/websocket"
)

// ConnectionState represents the current state of the WebSocket connection
type ConnectionState string

const (
	StateConnected     ConnectionState = "connected"
	StateDisconnecting ConnectionState = "disconnecting"
	StateReconnecting  ConnectionState = "reconnecting"
	StateDisconnected  ConnectionState = "disconnected"
)

// Client manages WebSocket connection to PACE server
type Client struct {
	host              string
	port              int
	reconnectDelay    time.Duration
	maxReconnectDelay time.Duration

	conn  *websocket.Conn
	state ConnectionState
	mu    sync.RWMutex

	// Channels for communication
	messages   chan *protocol.Message
	sendQueue  chan string
	errors     chan error
	connected  chan bool
	disconnect chan bool
	done       chan bool

	// Reconnection tracking
	reconnectAttempts int
}

// New creates a new WebSocket client
func New(host string, port int, reconnectDelay, maxReconnectDelay time.Duration) *Client {
	return &Client{
		host:              host,
		port:              port,
		reconnectDelay:    reconnectDelay,
		maxReconnectDelay: maxReconnectDelay,
		state:             StateDisconnected,
		messages:          make(chan *protocol.Message, 100),
		sendQueue:         make(chan string, 100),
		errors:            make(chan error, 10),
		connected:         make(chan bool, 10),
		disconnect:        make(chan bool),
		done:              make(chan bool),
	}
}

// Connect establishes WebSocket connection to the server
func (c *Client) Connect() error {
	url := fmt.Sprintf("ws://%s:%d", c.host, c.port)

	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to %s: %w", url, err)
	}

	c.mu.Lock()
	c.conn = conn
	c.state = StateConnected
	c.reconnectAttempts = 0
	c.mu.Unlock()

	// Notify that we're connected
	select {
	case c.connected <- true:
	default:
	}

	// Start goroutines for reading and writing
	go c.readPump()
	go c.writePump()

	return nil
}

// readPump reads messages from the WebSocket connection
func (c *Client) readPump() {
	defer func() {
		c.handleDisconnect()
	}()

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.errors <- fmt.Errorf("websocket error: %w", err)
			}
			return
		}

		// Parse the message
		msg, err := protocol.Parse(string(message))
		if err != nil {
			c.errors <- fmt.Errorf("failed to parse message: %w", err)
			continue
		}

		// Send to messages channel
		select {
		case c.messages <- msg:
		default:
			// Channel full, log and continue
			log.Println("Warning: message channel full, dropping message")
		}
	}
}

// writePump writes messages to the WebSocket connection
func (c *Client) writePump() {
	for {
		select {
		case message := <-c.sendQueue:
			c.mu.RLock()
			conn := c.conn
			c.mu.RUnlock()

			if conn == nil {
				continue
			}

			err := conn.WriteMessage(websocket.TextMessage, []byte(message))
			if err != nil {
				c.errors <- fmt.Errorf("failed to send message: %w", err)
				return
			}

		case <-c.disconnect:
			return
		}
	}
}

// Send sends a query to the server
func (c *Client) Send(query string) error {
	c.mu.RLock()
	state := c.state
	c.mu.RUnlock()

	if state != StateConnected {
		return fmt.Errorf("not connected to server")
	}

	select {
	case c.sendQueue <- query:
		return nil
	case <-time.After(5 * time.Second):
		return fmt.Errorf("timeout sending message")
	}
}

// Messages returns the channel for receiving parsed messages
func (c *Client) Messages() <-chan *protocol.Message {
	return c.messages
}

// Errors returns the channel for receiving errors
func (c *Client) Errors() <-chan error {
	return c.errors
}

// Connected returns the channel for receiving connection events
func (c *Client) Connected() <-chan bool {
	return c.connected
}

// State returns the current connection state
func (c *Client) State() ConnectionState {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.state
}

// IsConnected returns true if the client is connected
func (c *Client) IsConnected() bool {
	return c.State() == StateConnected
}

// handleDisconnect handles disconnection and initiates reconnection
func (c *Client) handleDisconnect() {
	c.mu.Lock()
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}
	c.state = StateReconnecting
	c.mu.Unlock()

	// Attempt to reconnect
	go c.Reconnect()
}

// Reconnect attempts to reconnect with exponential backoff
func (c *Client) Reconnect() {
	for {
		select {
		case <-c.done:
			return
		default:
		}

		c.reconnectAttempts++

		// Calculate backoff delay
		delay := c.reconnectDelay * time.Duration(c.reconnectAttempts)
		if delay > c.maxReconnectDelay {
			delay = c.maxReconnectDelay
		}

		log.Printf("Reconnecting in %v (attempt %d)...", delay, c.reconnectAttempts)
		time.Sleep(delay)

		err := c.Connect()
		if err == nil {
			log.Println("Reconnected successfully")
			return
		}

		c.errors <- fmt.Errorf("reconnection failed: %w", err)
	}
}

// Close gracefully closes the WebSocket connection
func (c *Client) Close() error {
	c.mu.Lock()
	c.state = StateDisconnecting
	c.mu.Unlock()

	// Signal goroutines to stop
	close(c.done)
	close(c.disconnect)

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.conn != nil {
		err := c.conn.WriteMessage(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
		)
		if err != nil {
			return err
		}

		c.conn.Close()
		c.conn = nil
	}

	c.state = StateDisconnected
	return nil
}
