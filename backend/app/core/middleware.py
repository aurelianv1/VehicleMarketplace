"""Middleware-uri de securitate, aplicate tuturor cererilor HTTP.

Sunt scrise ca middleware ASGI „pur” (nu BaseHTTPMiddleware): funcționează și
pentru răspunsurile în flux și lasă WebSocket-urile să treacă neatinse.
"""

import json
import logging
import time
from collections import defaultdict, deque
from urllib.parse import urlsplit

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.activity import client_ip, log_action

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


async def _send_json(send: Send, status: int, detail: str, headers: list[tuple[bytes, bytes]] | None = None) -> None:
    body = json.dumps({"detail": detail}, ensure_ascii=False).encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [(b"content-type", b"application/json; charset=utf-8"), (b"content-length", str(len(body)).encode()), *(headers or [])],
    })
    await send({"type": "http.response.body", "body": body})


class RequestContextMiddleware:
    """Ține minte IP-ul clientului pe durata cererii, pentru jurnalul de activitate."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] in ("http", "websocket"):
            client = scope.get("client")
            token = client_ip.set(client[0] if client else "-")
            try:
                await self.app(scope, receive, send)
            finally:
                client_ip.reset(token)
            return
        await self.app(scope, receive, send)


class RateLimitMiddleware:
    """Maximum `limit` cereri pe minut per IP; peste limită răspunde 429 până se eliberează fereastra.

    Fereastră glisantă: pentru fiecare IP păstrăm momentele ultimelor cereri și le
    numărăm pe cele din ultimele 60 de secunde. Pozele statice (/uploads) nu se
    numără: o singură pagină de listă încarcă 12 poze, iar ele nu sunt acțiuni.
    Limitare: contoarele stau în memorie (un singur proces), ca și conexiunile WebSocket.
    """

    WINDOW_SECONDS = 60.0
    EXEMPT_PREFIXES = ("/uploads/", "/health")

    def __init__(self, app: ASGIApp, limit: int) -> None:
        self.app = app
        self.limit = limit
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        # Până când nu mai scriem în jurnal pentru un IP blocat (un rând per blocare, nu per cerere)
        self.logged_until: dict[str, float] = {}

    def _is_limited(self, ip: str, now: float) -> float | None:
        """None dacă cererea e permisă, altfel câte secunde mai trebuie așteptat."""
        window = self.hits[ip]
        while window and now - window[0] >= self.WINDOW_SECONDS:
            window.popleft()
        if len(window) >= self.limit:
            return self.WINDOW_SECONDS - (now - window[0])
        window.append(now)
        return None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] == "OPTIONS" or scope["path"].startswith(self.EXEMPT_PREFIXES):
            await self.app(scope, receive, send)
            return

        ip = scope["client"][0] if scope.get("client") else "-"
        now = time.monotonic()
        wait = self._is_limited(ip, now)
        if wait is None:
            remaining = str(self.limit - len(self.hits[ip])).encode()

            # Antetele standard X-RateLimit-*: clientul vede limita și câte cereri mai are
            async def send_with_limits(message: Message) -> None:
                if message["type"] == "http.response.start":
                    message["headers"] = [
                        *message.get("headers", []),
                        (b"x-ratelimit-limit", str(self.limit).encode()),
                        (b"x-ratelimit-remaining", remaining),
                    ]
                await send(message)

            await self.app(scope, receive, send_with_limits)
            return

        retry_after = max(1, int(wait) + 1)
        # Doar prima respingere ajunge în jurnal, ca un atac să nu umple fișierul
        if self.logged_until.get(ip, 0) < now:
            self.logged_until[ip] = now + wait
            log_action("security.rate_limited", level=logging.WARNING, path=scope["path"], retry_after=retry_after)
        await _send_json(
            send, 429,
            f"Prea multe cereri. Încearcă din nou peste {retry_after} secunde.",
            [(b"retry-after", str(retry_after).encode()), (b"x-ratelimit-limit", str(self.limit).encode()), (b"x-ratelimit-remaining", b"0")],
        )


class OriginCheckMiddleware:
    """Protecție CSRF: o cerere care modifică date (POST/PATCH/DELETE) trimisă de un
    browser de pe alt site e respinsă.

    De ce e suficient aici: API-ul folosește token-ul din header-ul Authorization,
    pe care un alt site nu îl poate atașa (e în memoria aplicației noastre). Singurul
    cookie e cel de refresh (SameSite=Lax, path=/auth). Verificarea antetului Origin
    închide și cazul rămas: un formular de pe alt site care ar ținti /auth/*.
    Cererile fără Origin (curl, aplicații native) nu vin din browser, deci nu pot fi CSRF.
    """

    def __init__(self, app: ASGIApp, allowed_origins: list[str]) -> None:
        self.app = app
        self.allowed = {o.rstrip("/") for o in allowed_origins}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in UNSAFE_METHODS:
            await self.app(scope, receive, send)
            return

        headers = dict(scope["headers"])
        origin = headers.get(b"origin", b"").decode()
        if not origin:
            # Unele browsere trimit doar Referer; luăm originea din el
            referer = headers.get(b"referer", b"").decode()
            if referer:
                parts = urlsplit(referer)
                origin = f"{parts.scheme}://{parts.netloc}"

        if origin and not self._is_allowed(origin, headers.get(b"host", b"").decode()):
            log_action("security.csrf_blocked", level=logging.WARNING, origin=origin, path=scope["path"])
            await _send_json(send, 403, "Cerere respinsă: originea nu este permisă")
            return
        await self.app(scope, receive, send)

    def _is_allowed(self, origin: str, host: str) -> bool:
        if origin == "null":  # pagini locale (file://) sau iframe-uri izolate
            return False
        # Același domeniu (aplicația servită de Apache împreună cu API-ul) sau o origine din CORS_ORIGINS
        return origin.split("://", 1)[-1] == host or origin in self.allowed


class SecurityHeadersMiddleware:
    """Antete de securitate pe toate răspunsurile API-ului.

    Pagina aplicației (HTML-ul) primește aceleași antete de la Apache în producție
    și de la Vite în dezvoltare; aici protejăm răspunsurile JSON și pozele.
    """

    # /docs (Swagger) încarcă scripturi de pe un CDN, deci are o politică proprie
    DOCS_PATHS = ("/docs", "/redoc")
    API_CSP = b"default-src 'none'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    DOCS_CSP = (
        b"default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
        b"style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https://fastapi.tiangolo.com; "
        b"frame-ancestors 'none'"
    )

    def __init__(self, app: ASGIApp, hsts: bool) -> None:
        self.app = app
        self.hsts = hsts

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        csp = self.DOCS_CSP if scope["path"].startswith(self.DOCS_PATHS) else self.API_CSP

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers += [
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"strict-origin-when-cross-origin"),
                    (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=()"),
                    (b"cross-origin-opener-policy", b"same-origin"),
                    (b"content-security-policy", csp),
                ]
                if self.hsts:  # doar pe HTTPS are sens
                    headers.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)
