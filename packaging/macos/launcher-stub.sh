#!/bin/bash

set -euo pipefail

MESSAGE="Clowder AI macOS app scaffold was built successfully.\n\nThis bundle currently contains the packaging skeleton only.\nThe native launcher and bundled service startup are not implemented yet."

if command -v osascript >/dev/null 2>&1; then
  osascript -e "display dialog \"${MESSAGE}\" buttons {\"OK\"} default button \"OK\" with title \"Clowder AI\""
else
  printf '%s\n' "$MESSAGE"
fi
