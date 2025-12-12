.PHONY: build run test clean build-all build-macos build-linux build-windows build-static build-release install-deps

# Binary name
BINARY_NAME=pace-cli
BUILD_DIR=build

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GORUN=$(GOCMD) run
GOTEST=$(GOCMD) test
GOMOD=$(GOCMD) mod
GOCLEAN=$(GOCMD) clean

# Linker flags for smaller binaries
LDFLAGS=-ldflags="-s -w"

# Development commands
build:
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p $(BUILD_DIR)
	$(GOBUILD) -o $(BUILD_DIR)/$(BINARY_NAME) main.go

run:
	@echo "Running $(BINARY_NAME)..."
	$(GORUN) main.go

test:
	@echo "Running tests..."
	$(GOTEST) -v ./...

clean:
	@echo "Cleaning..."
	@$(GOCLEAN)
	@rm -rf $(BUILD_DIR)

install-deps:
	@echo "Installing dependencies..."
	$(GOMOD) download
	$(GOMOD) tidy

# Cross-compilation targets
build-all: build-macos build-linux build-windows
	@echo "All builds complete!"

build-macos:
	@echo "Building for macOS..."
	@mkdir -p $(BUILD_DIR)
	GOOS=darwin GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/pace-macos-x64 main.go
	GOOS=darwin GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/pace-macos-arm64 main.go

build-linux:
	@echo "Building for Linux..."
	@mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/pace-linux-x64 main.go
	GOOS=linux GOARCH=arm64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/pace-linux-arm64 main.go

build-windows:
	@echo "Building for Windows..."
	@mkdir -p $(BUILD_DIR)
	GOOS=windows GOARCH=amd64 $(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/pace-windows-x64.exe main.go

# Static linking for maximum compatibility (Linux only)
build-static:
	@echo "Building static binary for Linux..."
	@mkdir -p $(BUILD_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GOBUILD) -a -installsuffix cgo $(LDFLAGS) -o $(BUILD_DIR)/pace-linux-static main.go

# Release build with optimizations
build-release:
	@echo "Building release version..."
	@mkdir -p $(BUILD_DIR)
	$(GOBUILD) $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) main.go
	@echo "Release build complete: $(BUILD_DIR)/$(BINARY_NAME)"

# Generate checksums for release
checksums:
	@echo "Generating checksums..."
	@cd $(BUILD_DIR) && shasum -a 256 pace-* > checksums.txt
	@echo "Checksums generated in $(BUILD_DIR)/checksums.txt"

# Display binary sizes
sizes:
	@echo "Binary sizes:"
	@ls -lh $(BUILD_DIR)/pace-* 2>/dev/null || echo "No binaries found. Run 'make build-all' first."

# Help
help:
	@echo "Available targets:"
	@echo "  make build          - Build for current platform"
	@echo "  make run            - Run the application"
	@echo "  make test           - Run tests"
	@echo "  make clean          - Clean build artifacts"
	@echo "  make install-deps   - Install Go dependencies"
	@echo ""
	@echo "Cross-compilation:"
	@echo "  make build-all      - Build for all platforms"
	@echo "  make build-macos    - Build for macOS (x64 + ARM)"
	@echo "  make build-linux    - Build for Linux (x64 + ARM)"
	@echo "  make build-windows  - Build for Windows (x64)"
	@echo "  make build-static   - Build static Linux binary"
	@echo ""
	@echo "Release:"
	@echo "  make build-release  - Build optimized release version"
	@echo "  make checksums      - Generate SHA256 checksums"
	@echo "  make sizes          - Show binary sizes"
