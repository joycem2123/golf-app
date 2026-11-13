#!/usr/bin/env bash
# Builds the event TV board website into docs/tv (served at https://clutchupgolf.com/tv/board/?c=CODE).
# Run from the app folder: bash scripts/build-tv-board.sh — then commit docs/tv.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=../docs/tv
rm -rf "$OUT.tmp"
EXPO_BASE_URL=/tv EXPO_PUBLIC_TV_ONLY=1 npx expo export -p web --output-dir "$OUT.tmp" >/dev/null
# GitHub Pages serves folders: put the page at /tv/board/ too, (docs/.nojekyll lets the _expo folder be served).
mkdir -p "$OUT.tmp/board"
cp "$OUT.tmp/index.html" "$OUT.tmp/board/index.html"
# (docs/.nojekyll, at the top of the site, makes GitHub Pages serve the _expo folder.)
rm -rf "$OUT" && mv "$OUT.tmp" "$OUT"
du -sh "$OUT"
