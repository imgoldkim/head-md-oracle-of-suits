#!/usr/bin/env bash
# Simple serve script for this demo folder.
# Usage: ./serve.sh  (starts a python3 http.server on port 5500 and opens browser)

PORT=5500

# Use workspace Demo folder (script is placed in Demo/) as web root
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR" || exit 1

# Start server in background
python3 -m http.server "$PORT" --bind 127.0.0.1 &>/dev/null &
PID=$!
sleep 0.5
echo "Started http.server on http://127.0.0.1:$PORT (PID $PID)"

# Try to open default browser on macOS, otherwise print URL
if command -v open >/dev/null 2>&1; then
  open "http://127.0.0.1:$PORT"
else
  echo "Open the URL in your browser: http://127.0.0.1:$PORT"
fi

echo "To stop the server run: kill $PID"
