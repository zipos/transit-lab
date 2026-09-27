#!/usr/bin/env bash
set -euo pipefail

# Directory of this script and repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_DIR"

# 1. Update repository if on a tracking git branch
if [ "${SKIP_GIT_PULL:-0}" != "1" ] && [ -d .git ]; then
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
      echo "Pulling latest changes (fast-forward only)..."
      git pull --ff-only
    fi
  fi
fi

# 2. Prepare staging directory on the same filesystem for atomic swap
STAGE_DIR="$(mktemp -d "$REPO_DIR/public.tmp.XXXXXX")"
OLD_DIR="$REPO_DIR/public.old.$$"

cleanup() {
  rm -rf "$STAGE_DIR" "$OLD_DIR" 2>/dev/null || true
}
trap cleanup EXIT

echo "Copying runtime files to staging directory..."
# Copy root static assets
cp "$REPO_DIR/index.html" "$STAGE_DIR/"
if [ -f "$REPO_DIR/icon.svg" ]; then
  cp "$REPO_DIR/icon.svg" "$STAGE_DIR/"
fi

# Copy root JS and CSS files
cp "$REPO_DIR"/*.js "$STAGE_DIR/" 2>/dev/null || true
cp "$REPO_DIR"/*.css "$STAGE_DIR/" 2>/dev/null || true

# Copy vendor/
if [ -d "$REPO_DIR/vendor" ]; then
  cp -R "$REPO_DIR/vendor" "$STAGE_DIR/"
fi

# Copy data/ excluding data/sources/
if [ -d "$REPO_DIR/data" ]; then
  mkdir -p "$STAGE_DIR/data"
  cp -R "$REPO_DIR/data/"* "$STAGE_DIR/data/"
  rm -rf "$STAGE_DIR/data/sources"
  rm -rf "$STAGE_DIR/data/__pycache__"
fi

# 3. Precompress every .js, .css, .json, .html, .svg with brotli -q 11 and gzip -9
echo "Precompressing assets with brotli and gzip..."
find "$STAGE_DIR" -type f \( -name "*.js" -o -name "*.css" -o -name "*.json" -o -name "*.html" -o -name "*.svg" \) | while IFS= read -r file; do
  if command -v brotli >/dev/null 2>&1; then
    brotli -q 11 -k -f "$file"
  else
    echo "Warning: brotli not found, skipping .br compression for $file" >&2
  fi
  gzip -9 -k -f "$file"
done

# 4. Atomically swap staging directory into public/
PUBLIC_DIR="$REPO_DIR/public"
echo "Swapping staging directory into $PUBLIC_DIR..."

if [ -d "$PUBLIC_DIR" ]; then
  mv "$PUBLIC_DIR" "$OLD_DIR"
  if ! mv "$STAGE_DIR" "$PUBLIC_DIR"; then
    echo "Error swapping directory; restoring previous public/" >&2
    mv "$OLD_DIR" "$PUBLIC_DIR"
    exit 1
  fi
  rm -rf "$OLD_DIR"
else
  mv "$STAGE_DIR" "$PUBLIC_DIR"
fi

echo "Site published successfully to $PUBLIC_DIR."
