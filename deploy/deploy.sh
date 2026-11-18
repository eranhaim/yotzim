#!/bin/sh
# Pull the latest code and rebuild the container. Run on the server from the repo folder.
set -e
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose up -d --build
docker image prune -f --filter "label=com.docker.compose.project=yotzim" >/dev/null 2>&1 || true
docker compose ps
