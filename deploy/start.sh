#!/bin/sh
# Pornirea containerului: baza de date, apoi FastAPI în fundal, apoi Apache în prim-plan.
set -e

export PORT="${PORT:-8080}"

cd /app/backend
PYTHONPATH=/app/backend python /app/deploy/bootstrap.py

# Un singur proces uvicorn: conexiunile WebSocket și contoarele de rate limiting stau
# în memorie. Ascultă doar local; din exterior se ajunge la el numai prin Apache.
# --proxy-headers: IP-ul real vine din X-Forwarded-For, pus de Apache (singurul proxy de încredere)
uvicorn app.main:app --host 127.0.0.1 --port 8000 \
    --proxy-headers --forwarded-allow-ips 127.0.0.1 --no-server-header &

# Apache rămâne procesul principal (dacă se oprește, se oprește containerul)
. /etc/apache2/envvars
mkdir -p "$APACHE_RUN_DIR" "$APACHE_LOCK_DIR" "$APACHE_LOG_DIR"
exec apache2 -D FOREGROUND
