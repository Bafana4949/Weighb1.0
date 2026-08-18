#!/usr/bin/env bash
# One command, zero manual steps: brings up every container an unattended
# weighment needs (postgres, mosquitto, the cloud web app, the edge daemon and
# the headless hardware simulator), waits for the daemon and web app to answer,
# then runs the fully automated "normal" scenario end to end — automatic ANPR
# registration capture, automatic weight capture, automatic driver-decision
# acceptance. No GUI, no curl, no manual accept.
#
# Usage:
#   scripts/run-auto-weighment.sh [scenario] [-- extra scenarios.py args]
#
# scenario defaults to "normal". Other valid scenarios (unauthorised, overload,
# unstable, driver-mismatch, offline-sync) skip the docker build/up step's
# --profile cloud dependency check since they don't need the booking queue,
# but the containers still need to be up first.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

SCENARIO="${1:-normal}"
if [ "${1:-}" != "" ] && [ "${1:-}" != "--" ]; then
  shift
fi

DAEMON_URL="${DAEMON_URL:-http://127.0.0.1:8010}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3010}"

echo "==> Starting containers (postgres, mosquitto, web, site-daemon, hardware-simulator)..."
docker compose --profile cloud --profile edge up -d --build

wait_for() {
  local name="$1" url="$2" tries=90
  echo -n "==> Waiting for ${name} at ${url} "
  for ((i = 0; i < tries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "OK"
      return 0
    fi
    echo -n "."
    sleep 2
  done
  echo "TIMEOUT"
  return 1
}

if ! wait_for "site daemon" "${DAEMON_URL}/health"; then
  echo "site-daemon never became healthy; check 'docker compose logs site-daemon'." >&2
  exit 1
fi

if ! wait_for "web app" "${WEB_URL}/api/health"; then
  echo "web app never became healthy; check 'docker compose logs web'." >&2
  exit 1
fi

PYTHON_BIN="python3"
command -v python3 >/dev/null 2>&1 || PYTHON_BIN="python"
if [ -x "apps/hardware-simulator/.venv/Scripts/python.exe" ]; then
  PYTHON_BIN="apps/hardware-simulator/.venv/Scripts/python.exe"
elif [ -x "apps/hardware-simulator/.venv/bin/python" ]; then
  PYTHON_BIN="apps/hardware-simulator/.venv/bin/python"
fi

echo "==> Running scenario '${SCENARIO}' (fully automatic — no manual input)..."
"$PYTHON_BIN" apps/hardware-simulator/scenarios.py "$SCENARIO" --daemon-url "$DAEMON_URL" --web-url "$WEB_URL" "$@"
