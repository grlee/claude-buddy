#!/usr/bin/env bash
# claude-buddy SessionStart hook — configure status line if opted in
#
# Reads ~/.claude-buddy/config.json for statusLineEnabled.
# If true, sets settings.json statusLine to point to buddy-status.sh.
# If false or missing, does nothing (does NOT remove an existing status line).

set -euo pipefail

CONFIG="$HOME/.claude-buddy/config.json"
SETTINGS="$HOME/.claude/settings.json"

# Bail if no config or jq not available
[ -f "$CONFIG" ] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

ENABLED=$(jq -r '.statusLineEnabled // false' "$CONFIG" 2>/dev/null)
[ "$ENABLED" = "true" ] || exit 0

# Resolve buddy-status.sh path relative to this hook
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$HOOK_DIR/.." && pwd)"
STATUS_SCRIPT="$PLUGIN_ROOT/statusline/buddy-status.sh"

[ -f "$STATUS_SCRIPT" ] || exit 0
[ -f "$SETTINGS" ] || exit 0

# Check if already pointing to buddy status
CURRENT=$(jq -r '.statusLine.command // ""' "$SETTINGS" 2>/dev/null)
if echo "$CURRENT" | grep -q "buddy-status.sh"; then
    exit 0
fi

# Patch settings.json with buddy status line
TMP="$SETTINGS.tmp.$$"
jq --arg cmd "$STATUS_SCRIPT" '.statusLine = {
    "type": "command",
    "command": $cmd,
    "padding": 1,
    "refreshInterval": 1
}' "$SETTINGS" > "$TMP" && mv "$TMP" "$SETTINGS"

exit 0
