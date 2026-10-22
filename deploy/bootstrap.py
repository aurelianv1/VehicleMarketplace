"""Pregătirea bazei de date la pornirea containerului (rulat din folderul backend/).

1. Aplică migrările Alembic (creează sau actualizează tabelele).
2. Dacă baza e goală SAU pozele anunțurilor lipsesc de pe disc, rulează seed.py.

De ce al doilea caz: pe planul gratuit Render, discul containerului se golește la
fiecare repornire (pozele dispar), dar baza de date PostgreSQL rămâne. Fără asta,
site-ul publicat ar arăta anunțuri cu poze lipsă. E o limitare a găzduirii gratuite,
nu a aplicației: în producție reală pozele ar sta pe un disc persistent sau pe S3.
"""

import subprocess
import sys

from sqlalchemy import func, select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.car_image import CarImage
from app.models.user import User


def needs_seed() -> str | None:
    with SessionLocal() as db:
        if not db.scalar(select(func.count(User.id))):
            return "baza de date e goală"
        image = db.scalar(select(CarImage).limit(1))
        if image and not (settings.upload_path / image.url).exists():
            return "pozele lipsesc de pe disc (disc nou după repornire)"
    return None


def main() -> None:
    print("[bootstrap] Migrări Alembic…", flush=True)
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)

    reason = needs_seed()
    if reason:
        print(f"[bootstrap] Date demonstrative (seed.py): {reason}", flush=True)
        import seed

        seed.main()
    else:
        print("[bootstrap] Datele existente sunt în regulă", flush=True)


if __name__ == "__main__":
    main()
