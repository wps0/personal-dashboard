#!/usr/bin/env sh
# Runs the app in a throwaway Podman container, so Node and npm packages never
# touch the host. Works rootless; files the container writes stay owned by you.
#
#   ./scripts/dev-container.sh           # production build → http://localhost:5173 (fast; use this daily)
#   ./scripts/dev-container.sh dev       # dev server with hot reload (≈3× slower UI; for hacking on the code)
#   ./scripts/dev-container.sh npm test  # any other command
#
# Clean up everything it created:
#   podman volume rm dashboard-node-modules && podman rmi docker.io/library/node:22
set -eu

cd "$(dirname "$0")/.."
ENGINE="${ENGINE:-podman}"
IMAGE="docker.io/library/node:22"

case "${1:-}" in
  "") set -- sh -c 'npm run build && exec npx vite preview --host 0.0.0.0 --port 5173 --strictPort' ;;
  dev) set -- npm run dev -- --host 0.0.0.0 --port 5173 --strictPort ;;
esac

# node_modules lives in a named volume, not in your checkout.
# :Z relabels the checkout for SELinux (Fedora); only ever point this at the project dir.
exec "$ENGINE" run --rm -it \
  -v "$PWD":/app:Z \
  -v dashboard-node-modules:/app/node_modules \
  -w /app \
  -p 127.0.0.1:5173:5173 \
  "$IMAGE" \
  sh -c '[ -f node_modules/.package-lock.json ] && cmp -s package-lock.json node_modules/.lock-snapshot || { npm ci && cp package-lock.json node_modules/.lock-snapshot; }; exec "$@"' sh "$@"
