#!/usr/bin/env bash
# Builds a .zip of the extension ready for Chrome Web Store upload.
#
#   ./scripts/package.sh
#
# Output: dist/contextual-english-tracker-<version>.zip
#
# Only the files Chrome actually needs are included — repo metadata, docs and
# tooling are left out.

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./manifest.json').version")
OUT_DIR="dist"
OUT_FILE="${OUT_DIR}/contextual-english-tracker-${VERSION}.zip"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

# Fail early rather than shipping a broken package.
echo "Checking manifest.json…"
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"

echo "Syntax-checking JavaScript…"
for f in background/*.js content/*.js popup/*.js options/*.js; do
  node --check "$f"
done

echo "Packaging v${VERSION}…"

ITEMS=(manifest.json background content popup options shared icons LICENSE)

if command -v zip >/dev/null 2>&1; then
  zip -r -q "$OUT_FILE" "${ITEMS[@]}"
elif command -v powershell.exe >/dev/null 2>&1; then
  # Windows without the zip binary (e.g. plain Git Bash).
  PS_ITEMS=$(printf "'%s'," "${ITEMS[@]}")
  powershell.exe -NoProfile -Command \
    "Compress-Archive -Path ${PS_ITEMS%,} -DestinationPath '${OUT_FILE}' -Force"
else
  echo "Need either 'zip' or PowerShell to create the archive." >&2
  exit 1
fi

echo "Wrote $OUT_FILE"
