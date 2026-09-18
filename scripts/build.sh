#!/bin/bash
# Build dsh-source-control — no network, no npm install required.
#
#   host half     tsc → lib/index.js + lib/host/*.js + lib/types/**
#   browser half  tsc → lib/.client-build/**, then scripts/bundle-client.mjs
#                 inlines it into the single lib/client.js the profile serves
#
# Types for the @deepseek-ai/* packages come from a real DSH installation, so the
# compiled surface always matches the runtime the plugin mounts into. Override
# with DSH_CHECKOUT=/path/to/dsh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# --- locate a DSH installation to type against ------------------------------
DSH_DIRS=()
[ -n "${DSH_CHECKOUT:-}" ] && DSH_DIRS+=("$DSH_CHECKOUT")
DSH_DIRS+=("$HOME/.dsh/profiles/web")
for candidate in "$HOME"/.dsh/profiles/*; do DSH_DIRS+=("$candidate"); done
DSH_DIRS+=("$HOME/dsh-harness" "$HOME/dsh" "$HOME/.npm/_npx/1e7f6d9597241db0")

found_install=""
for candidate in "${DSH_DIRS[@]}"; do
  if [ -d "$candidate/node_modules/@deepseek-ai/dsh-session" ]; then found_install="$candidate"; break; fi
done
[ -n "$found_install" ] || { echo "build: no DSH installation found (set DSH_CHECKOUT)" >&2; exit 1; }
echo "=== DSH installation: $found_install ==="

# --- locate a TypeScript compiler -------------------------------------------
TSC=""
for candidate in \
  "$ROOT/node_modules/.bin/tsc" \
  "$found_install/node_modules/.bin/tsc" \
  "$HOME/.dsh/profiles/web/node_modules/.bin/tsc"
do
  if [ -x "$candidate" ]; then TSC="$candidate"; break; fi
done
if [ -z "$TSC" ] && command -v tsc >/dev/null 2>&1; then TSC="$(command -v tsc)"; fi
[ -n "$TSC" ] || { echo "build: no tsc found (npm i -D typescript, or install DSH)" >&2; exit 1; }
echo "=== tsc: $TSC ==="

# --- link the packages the host half compiles against -----------------------
link_pkg() {
  local spec="$1"
  local target=""
  for candidate in "${DSH_DIRS[@]}"; do
    if [ -e "$candidate/node_modules/$spec/package.json" ]; then target="$candidate/node_modules/$spec"; break; fi
  done
  if [ -z "$target" ]; then echo "build: dependency $spec not found in any DSH installation" >&2; exit 1; fi
  node -e '
    const fs = require("fs"), path = require("path");
    const link = path.resolve(process.argv[1]), target = path.resolve(process.argv[2]);
    const already = fs.existsSync(link) && fs.realpathSync(link) === target;
    if (!already) {
      fs.rmSync(link, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    }
  ' "node_modules/$spec" "$target"
}

mkdir -p node_modules/@deepseek-ai
link_pkg @types/node
link_pkg @deepseek-ai/cordis
link_pkg @deepseek-ai/dsh-host-webserver
link_pkg @deepseek-ai/dsh-session
link_pkg @deepseek-ai/dsh-client-ui-slots
link_pkg @deepseek-ai/dsh-client-ui-sidebar-right

# --- host half --------------------------------------------------------------
echo "=== Compiling host half (tsc) ==="
"$TSC" -p tsconfig.json

# --- browser half -----------------------------------------------------------
echo "=== Compiling browser half (tsc) ==="
"$TSC" -p tsconfig.client.build.json

echo "=== Bundling browser half ==="
node scripts/bundle-client.mjs

echo "=== Build complete ==="
