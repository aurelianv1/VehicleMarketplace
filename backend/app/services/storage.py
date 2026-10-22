"""Salvarea pozelor.

`ImageStorage` e interfața (un Protocol): ce trebuie să știe să facă orice loc de
stocare. `LocalImageStorage` o implementează pe disc. Dacă mai târziu vrem S3 sau
Cloudinary, scriem o clasă nouă care respectă aceeași interfață și schimbăm doar
rândul `storage = ...` de la final; rutele nu se modifică.
"""

import shutil
from io import BytesIO
from pathlib import Path
from typing import Protocol
from uuid import uuid4

from PIL import Image, UnidentifiedImageError

from app.core.config import settings

# Formatele acceptate, verificate după conținutul real al fișierului,
# nu după content-type (care poate fi falsificat de client)
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
# În plus, numele fișierului trebuie să aibă una dintre extensiile aprobate
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# Dimensiunile generate pentru fiecare poză încărcată
SIZE_FULL = (1600, 1200)
SIZE_MEDIUM = (800, 600)
SIZE_THUMB = (400, 300)

JPEG_QUALITY = 85


class ImageValidationError(ValueError):
    """Fișierul încărcat nu este o imagine validă sau e prea mare."""


class ImageStorage(Protocol):
    """Interfața pentru stocarea pozelor anunțurilor."""

    def save_image(self, listing_id: int, raw: bytes) -> dict[str, str]:
        """Validează și salvează poza; întoarce căile pentru url, url_medium, url_thumb."""
        ...

    def delete_image_files(self, paths: list[str | None]) -> None:
        """Șterge variantele unei poze."""
        ...

    def delete_listing_folder(self, listing_id: int) -> None:
        """Șterge toate pozele unui anunț."""
        ...


def check_extension(filename: str | None) -> None:
    """Prima barieră, ieftină: extensia numelui. A doua (în save_image) e conținutul real."""
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise ImageValidationError(f"Extensie nepermisă ({suffix or 'fără extensie'}). Sunt acceptate: {allowed}")


def decode_and_clean(raw: bytes, max_bytes: int) -> Image.Image:
    """Verifică fișierul și întoarce o imagine RGB „curată”.

    Imaginea e decodată în pixeli și apoi re-codificată la salvare. Astfel tot ce nu
    e imagine propriu-zisă se pierde: metadate EXIF (inclusiv locația GPS a pozei),
    date lipite după sfârșitul fișierului și mesaje ascunse prin steganografie în
    biții cei mai puțin semnificativi (redimensionarea și compresia JPEG îi modifică).
    """
    if len(raw) > max_bytes:
        raise ImageValidationError(f"Fișierul depășește limita de {max_bytes // (1024 * 1024)} MB")
    if not raw:
        raise ImageValidationError("Fișierul este gol")

    try:
        image = Image.open(BytesIO(raw))
        image.verify()  # verifică integritatea, apoi fișierul trebuie redeschis
        image = Image.open(BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ImageValidationError("Fișierul nu este o imagine validă") from exc

    if image.format not in ALLOWED_FORMATS:
        raise ImageValidationError("Sunt acceptate doar imagini JPEG, PNG sau WEBP")

    # Transparența PNG/WEBP devine fundal alb la conversia în JPEG
    if image.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", image.size, (255, 255, 255))
        converted = image.convert("RGBA")
        background.paste(converted, mask=converted.split()[-1])
        return background
    return image.convert("RGB")


class LocalImageStorage:
    """Pozele stau pe disc, în <root>/listings/{id}/, servite static la /uploads."""

    def __init__(self, root: Path, max_image_mb: int) -> None:
        self.root = root
        self.max_bytes = max_image_mb * 1024 * 1024

    def _listing_dir(self, listing_id: int) -> Path:
        path = self.root / "listings" / str(listing_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def _save_variant(image: Image.Image, size: tuple[int, int], destination: Path) -> None:
        variant = image.copy()
        variant.thumbnail(size, Image.Resampling.LANCZOS)
        # Fără parametrul exif: metadatele originale nu ajung în fișierul salvat
        variant.save(destination, format="JPEG", quality=JPEG_QUALITY, optimize=True)

    def save_image(self, listing_id: int, raw: bytes) -> dict[str, str]:
        image = decode_and_clean(raw, self.max_bytes)
        folder = self._listing_dir(listing_id)
        name = uuid4().hex  # nume generat: fără coliziuni și fără căi venite de la utilizator

        files = {
            "url": (f"{name}_full.jpg", SIZE_FULL),
            "url_medium": (f"{name}_medium.jpg", SIZE_MEDIUM),
            "url_thumb": (f"{name}_thumb.jpg", SIZE_THUMB),
        }
        result: dict[str, str] = {}
        for key, (filename, size) in files.items():
            self._save_variant(image, size, folder / filename)
            result[key] = f"listings/{listing_id}/{filename}"
        return result

    def delete_image_files(self, paths: list[str | None]) -> None:
        for relative in paths:
            if not relative:
                continue
            target = self.root / relative
            try:
                # Protecție: nu ștergem nimic din afara folderului uploads
                target.resolve().relative_to(self.root.resolve())
            except ValueError:
                continue
            target.unlink(missing_ok=True)

    def delete_listing_folder(self, listing_id: int) -> None:
        # Baza de date curăță rândurile prin CASCADE, dar fișierele trebuie șterse explicit
        folder = self.root / "listings" / str(listing_id)
        if folder.exists():
            shutil.rmtree(folder, ignore_errors=True)


# Implementarea folosită de aplicație. Tipul declarat e interfața, nu clasa concretă.
storage: ImageStorage = LocalImageStorage(settings.upload_path, settings.MAX_IMAGE_SIZE_MB)

# Funcțiile vechi rămân ca scurtături, ca rutele și seed.py să nu se schimbe
save_image = storage.save_image
delete_image_files = storage.delete_image_files
delete_listing_folder = storage.delete_listing_folder
