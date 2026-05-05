#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Error: .env not found. Copy .env.example and fill in values first."
  exit 1
fi

docker compose up --build "$@"
