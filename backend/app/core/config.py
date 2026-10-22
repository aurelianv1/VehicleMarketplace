from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Configurarea aplicației, citită din fișierul .env."""

    model_config = SettingsConfigDict(
        env_file=(BASE_DIR / ".env", BASE_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PROJECT_NAME: str = "Golden Marketplace API"
    API_V1_PREFIX: str = ""

    DATABASE_URL: str = "postgresql+psycopg://carmarket:carmarket@localhost:5432/carmarket"

    SECRET_KEY: str = "schimba-aceasta-cheie-in-productie"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    UPLOAD_DIR: str = "uploads"
    MAX_IMAGE_SIZE_MB: int = 5
    MAX_IMAGES_PER_LISTING: int = 15

    # Jurnalul de activitate (fișier relativ la backend/)
    LOG_DIR: str = "logs"
    # Cereri permise per IP într-un minut; peste limită → 429 temporar
    RATE_LIMIT_PER_MINUTE: int = 100
    # Cookie-ul de refresh e trimis doar către rutele de autentificare. În producție,
    # API-ul stă în spatele Apache sub /api, deci calea devine /api/auth
    REFRESH_COOKIE_PATH: str = "/auth"
    # True în producție (HTTPS): cookie-ul de refresh pleacă doar pe conexiuni criptate
    COOKIE_SECURE: bool = False

    # Adresa publică a aplicației (unde revine utilizatorul după plata pe Stripe)
    PUBLIC_URL: str = "http://localhost:5173"
    # Stripe, mod TEST (sk_test_...). Fără cheie, promovarea e dezactivată (503)
    STRIPE_SECRET_KEY: str = ""
    # Opțional: semnătura webhook-urilor Stripe (whsec_...)
    STRIPE_WEBHOOK_SECRET: str = ""
    PROMOTION_PRICE_CENTS: int = 500
    PROMOTION_CURRENCY: str = "eur"
    PROMOTION_DAYS: int = 7

    @field_validator("DATABASE_URL")
    @classmethod
    def use_psycopg_driver(cls, url: str) -> str:
        # Render (și alți furnizori) dau adresa ca postgres://...; SQLAlchemy cu psycopg 3
        # are nevoie de postgresql+psycopg://...
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def log_path(self) -> Path:
        path = BASE_DIR / self.LOG_DIR
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def upload_path(self) -> Path:
        path = BASE_DIR / self.UPLOAD_DIR
        path.mkdir(parents=True, exist_ok=True)
        return path


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
