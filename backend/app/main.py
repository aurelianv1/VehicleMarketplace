from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core.config import settings
from app.core.middleware import (
    OriginCheckMiddleware,
    RateLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
)
from app.db.session import engine
from app.routers import admin, auth, conversations, favorites, images, listings, payments, users, ws

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API pentru un marketplace de mașini (proiect de facultate)",
    version="0.1.0",
)

# Ordinea contează: ultimul adăugat rulează primul. O cerere trece prin:
# context (IP) → antete de securitate → CORS → rate limiting → verificarea Origin → rute
app.add_middleware(OriginCheckMiddleware, allowed_origins=settings.cors_origins_list)
app.add_middleware(RateLimitMiddleware, limit=settings.RATE_LIMIT_PER_MINUTE)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,   # necesar pentru cookie-ul de refresh
    allow_methods=["*"],
    allow_headers=["*"],
    # Altfel JavaScript-ul de pe alt port nu poate citi aceste antete
    expose_headers=["Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
)
app.add_middleware(SecurityHeadersMiddleware, hsts=settings.COOKIE_SECURE)
app.add_middleware(RequestContextMiddleware)

# Pozele anunțurilor se servesc ca fișiere statice din folderul uploads/
app.mount("/uploads", StaticFiles(directory=settings.upload_path), name="uploads")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(listings.router)
app.include_router(images.router)
app.include_router(favorites.router)
app.include_router(conversations.router)
app.include_router(ws.router)
app.include_router(admin.router)
app.include_router(payments.router)


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Verifică dacă API-ul și baza de date răspund."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception as exc:  # noqa: BLE001
        db_status = f"error: {exc.__class__.__name__}"

    return {"api": "ok", "database": db_status}
