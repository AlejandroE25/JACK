#!/bin/bash
# Remote .env Configuration Management Script
#
# Usage:
#   ./scripts/update-env.sh get                    # View current config
#   ./scripts/update-env.sh set KEY=value          # Update single variable
#   ./scripts/update-env.sh set KEY1=val1 KEY2=val2  # Update multiple variables
#   ./scripts/update-env.sh delete KEY1 KEY2       # Delete variables
#
# Environment variables:
#   SERVER_URL - proPACE server URL (default: http://10.0.0.69:3000)
#   AUTH_TOKEN - Authentication token for API (required)

# Configuration
SERVER_URL="${SERVER_URL:-http://10.0.0.69:3000}"
AUTH_TOKEN="${AUTH_TOKEN}"

# Check if auth token is set
if [ -z "$AUTH_TOKEN" ]; then
  echo "Error: AUTH_TOKEN environment variable not set"
  echo "Usage: AUTH_TOKEN=your_token ./scripts/update-env.sh <command>"
  exit 1
fi

# Function to get current config
get_config() {
  echo "Fetching current configuration from ${SERVER_URL}..."
  curl -s -X GET \
    "${SERVER_URL}/api/config" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" | jq '.'
}

# Function to update config
set_config() {
  local updates="{}"

  # Parse KEY=value pairs
  for arg in "$@"; do
    if [[ $arg =~ ^([A-Z_][A-Z0-9_]*)=(.+)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      updates=$(echo "$updates" | jq --arg k "$key" --arg v "$value" '. + {($k): $v}')
    else
      echo "Error: Invalid format '$arg'. Expected KEY=value"
      exit 1
    fi
  done

  echo "Updating configuration..."
  echo "Updates: $updates"

  curl -s -X POST \
    "${SERVER_URL}/api/config" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$updates" | jq '.'

  echo ""
  echo "⚠️  Server restart required for changes to take effect!"
}

# Function to delete config keys
delete_config() {
  local keys="["
  local first=true

  for key in "$@"; do
    if [ "$first" = true ]; then
      first=false
    else
      keys+=","
    fi
    keys+="\"$key\""
  done
  keys+="]"

  echo "Deleting configuration keys: $keys"

  curl -s -X DELETE \
    "${SERVER_URL}/api/config" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"keys\": $keys}" | jq '.'

  echo ""
  echo "⚠️  Server restart required for changes to take effect!"
}

# Main command dispatcher
case "$1" in
  get)
    get_config
    ;;
  set)
    if [ $# -lt 2 ]; then
      echo "Error: No variables specified"
      echo "Usage: $0 set KEY=value [KEY2=value2 ...]"
      exit 1
    fi
    shift
    set_config "$@"
    ;;
  delete)
    if [ $# -lt 2 ]; then
      echo "Error: No keys specified"
      echo "Usage: $0 delete KEY1 [KEY2 ...]"
      exit 1
    fi
    shift
    delete_config "$@"
    ;;
  *)
    echo "proPACE Remote Configuration Management"
    echo ""
    echo "Usage:"
    echo "  $0 get                           - View current configuration"
    echo "  $0 set KEY=value [KEY2=val2...]  - Update environment variables"
    echo "  $0 delete KEY1 [KEY2...]         - Delete environment variables"
    echo ""
    echo "Environment Variables:"
    echo "  SERVER_URL - Server URL (default: http://10.0.0.69:3000)"
    echo "  AUTH_TOKEN - Authentication token (required)"
    echo ""
    echo "Examples:"
    echo "  AUTH_TOKEN=mytoken $0 get"
    echo "  AUTH_TOKEN=mytoken $0 set OPENAI_API_KEY=sk-..."
    echo "  AUTH_TOKEN=mytoken $0 set PORT=9001 HOST=0.0.0.0"
    echo "  AUTH_TOKEN=mytoken $0 delete OLD_KEY"
    exit 1
    ;;
esac
