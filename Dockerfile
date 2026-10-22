# Imaginea de producție: Apache + frontend-ul construit + FastAPI, într-un singur container.
# Construire și pornire locală:  docker compose --profile prod up --build   → http://localhost:8080

# ---- Etapa 1: build-ul frontend-ului (Node e necesar doar aici, nu în imaginea finală) ----
FROM node:22-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Fără VITE_API_URL: aplicația folosește același domeniu, cu API-ul sub /api
RUN npm run build

# ---- Etapa 2: imaginea finală ----
FROM python:3.13-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends apache2 \
    && rm -rf /var/lib/apt/lists/* \
    && a2enmod proxy proxy_http proxy_wstunnel headers rewrite remoteip \
    && a2dissite 000-default \
    # Portul vine din variabila PORT, nu e fix pe 80
    && echo 'Listen ${PORT}' > /etc/apache2/ports.conf

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY deploy/ /app/deploy/
COPY deploy/apache/site.conf /etc/apache2/sites-enabled/site.conf
COPY --from=frontend /build/dist/ /var/www/html/

RUN mkdir -p uploads logs && chmod +x /app/deploy/start.sh

ENV PORT=8080 \
    PYTHONUNBUFFERED=1 \
    COOKIE_SECURE=true \
    REFRESH_COOKIE_PATH=/api/auth

EXPOSE 8080
CMD ["/app/deploy/start.sh"]
