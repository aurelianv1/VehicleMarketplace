"""Încărcarea pozelor: extensii, conținut, dimensiune, curățarea datelor ascunse."""

from io import BytesIO

import pytest
from PIL import Image

from app.services.storage import ImageValidationError, LocalImageStorage, check_extension, decode_and_clean

MB = 1024 * 1024


def png_bytes(size=(40, 30), color=(200, 30, 30), mode="RGB") -> bytes:
    buffer = BytesIO()
    Image.new(mode, size, color).save(buffer, format="PNG")
    return buffer.getvalue()


@pytest.mark.parametrize("name", ["poza.jpg", "POZA.JPEG", "a.png", "b.webp"])
def test_allowed_extensions(name):
    check_extension(name)


@pytest.mark.parametrize("name", ["virus.exe", "poza.jpg.php", "document.pdf", "fara_extensie", None])
def test_other_extensions_are_rejected(name):
    with pytest.raises(ImageValidationError, match="Extensie nepermisă"):
        check_extension(name)


def test_text_file_renamed_to_jpg_is_rejected():
    with pytest.raises(ImageValidationError, match="nu este o imagine validă"):
        decode_and_clean(b"nu sunt o imagine, doar text", 5 * MB)


def test_file_over_size_limit_is_rejected():
    with pytest.raises(ImageValidationError, match="depășește limita"):
        decode_and_clean(b"x" * (2 * MB + 1), 2 * MB)


def test_empty_file_is_rejected():
    with pytest.raises(ImageValidationError, match="gol"):
        decode_and_clean(b"", 5 * MB)


def test_transparent_png_gets_white_background():
    image = decode_and_clean(png_bytes(color=(0, 0, 0, 0), mode="RGBA"), 5 * MB)
    assert image.mode == "RGB"
    assert image.getpixel((0, 0)) == (255, 255, 255)


def test_hidden_data_appended_after_image_is_removed(tmp_path):
    # Steganografie simplă: date ascunse lipite după sfârșitul fișierului PNG
    secret = b"MESAJ-SECRET-ASCUNS-IN-POZA"
    storage = LocalImageStorage(tmp_path, max_image_mb=5)
    paths = storage.save_image(1, png_bytes() + secret)
    for relative in paths.values():
        saved = (tmp_path / relative).read_bytes()
        assert secret not in saved
        assert saved[:3] == b"\xff\xd8\xff"  # re-codificat ca JPEG nou


def test_exif_metadata_is_removed(tmp_path):
    # EXIF poate conține locația GPS unde a fost făcută poza
    exif = Image.Exif()
    exif[0x010F] = "Producator-Telefon"  # Make
    buffer = BytesIO()
    Image.new("RGB", (40, 30), (10, 120, 200)).save(buffer, format="JPEG", exif=exif)
    assert b"Producator-Telefon" in buffer.getvalue()

    storage = LocalImageStorage(tmp_path, max_image_mb=5)
    paths = storage.save_image(2, buffer.getvalue())
    saved = Image.open(tmp_path / paths["url"])
    assert not saved.getexif()


def test_three_sizes_are_generated_within_limits(tmp_path):
    storage = LocalImageStorage(tmp_path, max_image_mb=5)
    paths = storage.save_image(3, png_bytes(size=(3000, 2000)))
    sizes = {key: Image.open(tmp_path / rel).size for key, rel in paths.items()}
    assert sizes["url"][0] <= 1600 and sizes["url_medium"][0] <= 800 and sizes["url_thumb"][0] <= 400


def test_delete_never_leaves_the_upload_folder(tmp_path):
    outside = tmp_path.parent / "nu-se-sterge.txt"
    outside.write_text("important")
    storage = LocalImageStorage(tmp_path / "uploads", max_image_mb=5)
    storage.delete_image_files(["../nu-se-sterge.txt"])
    assert outside.exists()
