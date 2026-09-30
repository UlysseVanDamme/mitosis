# Mitosis API (backend only; the frontend is a static Vite build served separately).
# Not deployed for the hackathon; kept clean: pinned slim base, no dev deps, non-root, healthcheck.
FROM ghcr.io/astral-sh/uv:0.12.5 AS uv

FROM python:3.12.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    MITOSIS_PROVIDER=fake
COPY --from=uv /uv /usr/local/bin/uv
RUN groupadd --system --gid 10001 mitosis && useradd --system --uid 10001 --gid mitosis --no-create-home mitosis
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/mitosis ./mitosis
COPY corpus /app/corpus
COPY demo/recordings /app/demo/recordings
RUN uv sync --frozen --no-dev && mkdir -p /app/backend/state && chown -R mitosis:mitosis /app/backend/state
USER mitosis
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status == 200 else 1)"
# Passcodes and the token secret come from the environment at run time (MITOSIS_PASSCODES, MITOSIS_SECRET).
CMD ["/app/backend/.venv/bin/uvicorn", "mitosis.api:app", "--host", "0.0.0.0", "--port", "8000", "--no-server-header", "--proxy-headers", "--forwarded-allow-ips", "127.0.0.1"]
