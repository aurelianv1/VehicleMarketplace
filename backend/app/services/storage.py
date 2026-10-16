"""Salvarea pozelor pe disc.

Interfața (save_image / delete_listing_folder) e intenționat simplă:
dacă mai târziu vrem S3 sau Cloudinary, se rescrie doar acest fișier,
iar restul aplicației rămâne neschimbat.
"""

import shutil
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from PIL import Image, UnidentifiedImageError

from app.core.config import settings

# Formatele acceptate, verificate după conținutul real al fișierului,
# nu după content-type (care poate fi falsificat de client)
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}

# Dimensiunile generate pentru fiecare poză încărcată
SIZE_FULL = (1600, 1200)
SIZE_MEDIUM = (800, 600)
SIZE_THUMB = (400, 300)

JPEG_QUALITY = 85


class ImageValidationError(ValueError):
    """Fișierul încărcat nu este o imagine validă sau e prea mare."""


def _listing_dir(listing_id: int) -> Path:
    path = settings.upload_path / "listings" / str(listing_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _save_variant(image: Image.Image, size: tuple[int, int], destination: Path) -> None:
    variant = image.copy()
    variant.thumbnail(size, Image.Resampling.LANCZOS)
    variant.save(destination, format="JPEG", quality=JPEG_QUALITY, optimize=True)


def save_image(listing_id: int, raw: bytes) -> dict[str, str]:
    """Validează și salvează o poză în trei dimensiuni.

    Întoarce căile relative (față de /uploads) pentru full, medium și thumb.
    """
    max_bytes = settings.MAX_IMAGE_SIZE_MB * 1024 * 1024
    if len(raw) > max_bytes:
        raise ImageValidationError(
            f"Fișierul depășește limita de {settings.MAX_IMAGE_SIZE_MB} MB"
        )
    if not raw:
        raise ImageValidationError("Fișierul este gol")

    try:
        image = Image.open(BytesIO(raw))
        image.verify()  # verifică integritatea, apoi fișierul trebuie redeschis
        image = Image.open(BytesIO(raw))
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageValidationError("Fișierul nu este o imagine validă") from exc

    if image.format not in ALLOWED_FORMATS:
        raise ImageValidationError("Sunt acceptate doar imagini JPEG, PNG sau WEBP")

    # Transparența PNG/WEBP devine fundal alb la conversia în JPEG
    if image.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", image.size, (255, 255, 255))
        converted = image.convert("RGBA")
        background.paste(converted, mask=converted.split()[-1])
        image = background
    elif image.mode != "RGB":
        image = image.convert("RGB")

    folder = _listing_dir(listing_id)
    name = uuid4().hex

    files = {
        "url": (f"{name}_full.jpg", SIZE_FULL),
        "url_medium": (f"{name}_medium.jpg", SIZE_MEDIUM),
        "url_thumb": (f"{name}_thumb.jpg", SIZE_THUMB),
    }

    result: dict[str, str] = {}
    for key, (filename, size) in files.items():
        _save_variant(image, size, folder / filename)
        result[key] = f"listings/{listing_id}/{filename}"

    return result


def delete_image_files(paths: list[str | None]) -> None:
    """Șterge de pe disc fișierele unei poze (full, medium, thumb)."""
    for relative in paths:
        if not relative:
            continue
        target = settings.upload_path / relative
        try:
            # Protecție: nu ștergem nimic din afara folderului uploads
            target.resolve().relative_to(settings.upload_path.resolve())
        except ValueError:
            continue
        target.unlink(missing_ok=True)


def delete_listing_folder(listing_id: int) -> None:
    """La ștergerea unui anunț, baza de date curăță rândurile prin CASCADE,
    dar fișierele de pe disc trebuie șterse explicit."""
    folder = settings.upload_path / "listings" / str(listing_id)
    if folder.exists():
        shutil.rmtree(folder, ignore_errors=True)
