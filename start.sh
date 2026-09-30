#!/usr/bin/env bash
# Start Mitosis: backend (FastAPI :8000) + frontend (Vite :5173). Ctrl-C stops both.
# Env overrides: BACKEND_PORT, FRONTEND_PORT, NO_OPEN=1 (skip browser), MITOSIS_FAKE_LLM=1 (force fake LLM),
# MITOSIS_PROVIDER=fake|claude-cli|anthropic.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
mkdir -p "$ROOT/logs"

# Secrets live in the gitignored .env; generate demo passcodes + token secret on first run (never printed).
ENV_FILE="$ROOT/.env"
touch "$ENV_FILE" && chmod 600 "$ENV_FILE"
if ! grep -Eq '^[[:space:]]*(export[[:space:]]+)?MITOSIS_PASSCODES=' "$ENV_FILE" && [[ -z "${MITOSIS_PASSCODES:-}" ]]; then
  python3 - >> "$ENV_FILE" <<'PY'
import json, secrets
users = ["desk", "jan", "sofie", "vandessel", "guest"]
print("MITOSIS_PASSCODES='" + json.dumps({u: secrets.token_urlsafe(9) for u in users}) + "'")
PY
  echo "[start] generated demo passcodes: see MITOSIS_PASSCODES in .env"
fi
if ! grep -Eq '^[[:space:]]*(export[[:space:]]+)?MITOSIS_SECRET=' "$ENV_FILE" && [[ -z "${MITOSIS_SECRET:-}" ]]; then
  echo "MITOSIS_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')" >> "$ENV_FILE"
fi

# LLM provider (never print the key): Anthropic key if present, else the local `claude -p` CLI.
if [[ -n "${MITOSIS_FAKE_LLM:-}" ]]; then
  echo "[start] MITOSIS_FAKE_LLM=$MITOSIS_FAKE_LLM: using the fake LLM"
elif [[ -n "${ANTHROPIC_API_KEY:-}" ]] || grep -Eq '^[[:space:]]*(export[[:space:]]+)?ANTHROPIC_API_KEY=["'"'"']?[^"'"'"'[:space:]]+' "$ENV_FILE"; then
  echo "[start] ANTHROPIC_API_KEY found: using the Anthropic API"
else
  export MITOSIS_PROVIDER="${MITOSIS_PROVIDER:-claude-cli}"
  echo "[start] no ANTHROPIC_API_KEY: MITOSIS_PROVIDER=$MITOSIS_PROVIDER"
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
( cd "$ROOT/backend" && exec setsid env -u PYTHONPATH uv run uvicorn mitosis.api:app --host 127.0.0.1 --port "$BACKEND_PORT" ) \
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
  if curl -sf -o /dev/null "http://127.0.0.1:$BACKEND_PORT/api/health"; then echo " ok"; break; fi
  if ! kill -0 "${PIDS[0]}" 2>/dev/null; then echo; echo "[start] backend died:"; tail -20 "$ROOT/logs/backend.log"; exit 1; fi
  printf "."; sleep 1
done

URL="http://localhost:$FRONTEND_PORT"
echo
echo "  Mitosis is up:  $URL"
echo "  API:            http://localhost:$BACKEND_PORT/api/health"
echo "  Log in with the demo users; passcodes are in .env (MITOSIS_PASSCODES)."
echo "  Live demo:      uv run demo/run_demo.py --interactive"
echo "  Ctrl-C to stop."
if [[ -z "${NO_OPEN:-}" ]] && command -v xdg-open >/dev/null; then
  (sleep 2; xdg-open "$URL" >/dev/null 2>&1 || true) &
fi

# Stay in the foreground until one of the servers exits or Ctrl-C.
wait -n "${PIDS[@]}" || true
if [[ -z "${STOPPING:-}" ]]; then echo "[start] a server exited; see logs/"; fi
