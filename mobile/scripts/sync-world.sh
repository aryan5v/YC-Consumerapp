#!/usr/bin/env bash
# Rebuilds the open world and bundles it: a dist copy in assets/world, plus the single-file HTML module the WebView loads.
set -euo pipefail
cd "$(dirname "$0")/.."
(cd ../world && npm ci && npm run build)
rm -rf assets/world
cp -R ../world/dist assets/world
node scripts/inline-world.mjs
