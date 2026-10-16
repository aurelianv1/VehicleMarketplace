from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from app.routers import auth, favorites, images, listings, users

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="API pentru un marketplace de mașini (proiect de facultate)",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,   # necesar pentru cookie-ul de refresh
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pozele anunțurilor se servesc ca fișiere statice din folderul uploads/
app.mount("/uploads", StaticFiles(directory=settings.upload_path), name="uploads")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(listings.router)
app.include_router(images.router)
app.include_router(favorites.router)


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
