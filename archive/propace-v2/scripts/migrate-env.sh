#!/bin/bash
# Environment Migration Script
# Adds new environment variables from .env.example to .env
# Run this after git pull to update .env with new variables

ENV_FILE=".env"
EXAMPLE_FILE=".env.example"

if [ ! -f "$EXAMPLE_FILE" ]; then
  echo "Error: $EXAMPLE_FILE not found"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE from $EXAMPLE_FILE"
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo "✅ Created $ENV_FILE"
  exit 0
fi

echo "Checking for new environment variables..."

# Read new variables from .env.example
while IFS= read -r line; do
  # Skip comments and empty lines
  if [[ "$line" =~ ^#.*$ ]] || [[ -z "$line" ]]; then
    continue
  fi

  # Extract key (before =)
  if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)= ]]; then
    key="${BASH_REMATCH[1]}"

    # Check if key exists in .env
    if ! grep -q "^${key}=" "$ENV_FILE"; then
      echo "  Adding new variable: $key"
      echo "$line" >> "$ENV_FILE"
    fi
  fi
done < "$EXAMPLE_FILE"

echo "✅ Environment migration complete"
