#!/bin/sh
set -eu

cd -- "$(dirname -- "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Instalá Node.js con npm para jugar." >&2
  exit 1
fi

if [ ! -x node_modules/electron/dist/electron ]; then
  npm ci --include=dev
fi

exec npm run desktop
