#!/usr/bin/env bash
# Start Mitosis: backend (FastAPI :8000) + frontend (Vite :5173). Ctrl-C stops both.
# Env overrides: BACKEND_PORT, FRONTEND_PORT, NO_OPEN=1 (skip browser), MITOSIS_FAKE_LLM=1 (force fake LLM).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
mkdir -p "$ROOT/logs"

# LLM key check (never print the key)
if [[ -f "$ROOT/.env" ]] && grep -Eq '^[[:space:]]*(export[[:space:]]+)?ANTHROPIC_API_KEY=["'"'"']?[^"'"'"'[:space:]]+' "$ROOT/.env"; then
  echo "[start] ANTHROPIC_API_KEY found in .env: using the real LLM${MITOSIS_FAKE_LLM:+ (but MITOSIS_FAKE_LLM=$MITOSIS_FAKE_LLM is set)}"
else
  echo "[start] WARNING: no ANTHROPIC_API_KEY in .env, running with the fake LLM (MITOSIS_FAKE_LLM=1)"
  export MITOSIS_FAKE_LLM=1
fi

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  STOPPING=1
  echo; echo "[start] stopping..."
  for pid in "${PIDS[@]}"; do kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

echo "[start] backend  -> logs/backend.log (port $BACKEND_PORT)"
( cd "$ROOT/backend" && exec setsid uv run uvicorn mitosis.api:app --host 127.0.0.1 --port "$BACKEND_PORT" ) \
  > "$ROOT/logs/backend.log" 2>&1 &
PIDS+=($!)

if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  echo "[start] npm install (first run)..."
  ( cd "$ROOT/frontend" && npm install --no-audit --no-fund ) > "$ROOT/logs/npm-install.log" 2>&1 \
    || { echo "[start] npm install failed, see logs/npm-install.log"; exit 1; }
fi
echo "[start] frontend -> logs/frontend.log (port $FRONTEND_PORT)"
( cd "$ROOT/frontend" && exec setsid npm run dev -- --port "$FRONTEND_PORT" --strictPort ) \
  > "$ROOT/logs/frontend.log" 2>&1 &
PIDS+=($!)

printf "[start] waiting for backend"
for _ in $(seq 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:$BACKEND_PORT/api/state"; then echo " ok"; break; fi
  if ! kill -0 "${PIDS[0]}" 2>/dev/null; then echo; echo "[start] backend died:"; tail -20 "$ROOT/logs/backend.log"; exit 1; fi
  printf "."; sleep 1
done

URL="http://localhost:$FRONTEND_PORT"
echo
echo "  Mitosis is up:  $URL"
echo "  API:            http://localhost:$BACKEND_PORT/api/state"
echo "  Live demo:      uv run demo/run_demo.py --interactive"
echo "  Ctrl-C to stop."
if [[ -z "${NO_OPEN:-}" ]] && command -v xdg-open >/dev/null; then
  (sleep 2; xdg-open "$URL" >/dev/null 2>&1 || true) &
fi

# Stay in the foreground until one of the servers exits or Ctrl-C.
wait -n "${PIDS[@]}" || true
if [[ -z "${STOPPING:-}" ]]; then echo "[start] a server exited; see logs/"; fi
