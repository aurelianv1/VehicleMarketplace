"""CAPTCHA propriu: o imagine cu un cod scurt, distorsionat, greu de citit automat.

Răspunsul NU se păstrează pe server. Clientul primește un token JWT semnat care
conține doar HMAC(cheia secretă, cod + id unic). La verificare recalculăm HMAC-ul
din ce a scris utilizatorul. Fără cheia secretă, tokenul nu dezvăluie codul.

Fiecare CAPTCHA se poate folosi o singură dată (id-urile folosite se țin minte până
expiră), altfel un robot ar rezolva unul manual și l-ar refolosi la nesfârșit.
"""

import base64
import hashlib
import hmac
import random
import secrets
import time
from datetime import datetime, timedelta, timezone
from io import BytesIO

import jwt
from PIL import Image, ImageDraw, ImageFilter, ImageFont

from app.core.config import settings

# Fără caractere ușor de confundat: 0/O, 1/I/L
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 4
TTL_SECONDS = 300
TOKEN_TYPE = "captcha"

_used: dict[str, float] = {}  # id CAPTCHA → momentul expirării


class CaptchaError(Exception):
    """Codul lipsește, e greșit, a expirat sau a fost deja folosit."""


def _digest(code: str, captcha_id: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"{code.upper()}:{captcha_id}".encode(), hashlib.sha256).hexdigest()


def _render(code: str) -> bytes:
    width, height = 180, 64
    image = Image.new("RGB", (width, height), (245, 247, 250))
    draw = ImageDraw.Draw(image)
    rng = random.SystemRandom()

    # Zgomot de fundal: linii și puncte care încurcă recunoașterea automată
    for _ in range(8):
        draw.line(
            [(rng.randint(0, width), rng.randint(0, height)), (rng.randint(0, width), rng.randint(0, height))],
            fill=(rng.randint(120, 200), rng.randint(120, 200), rng.randint(120, 200)), width=2,
        )
    for _ in range(300):
        draw.point((rng.randint(0, width), rng.randint(0, height)), fill=(rng.randint(80, 220),) * 3)

    font = ImageFont.load_default(size=38)
    for i, char in enumerate(code):
        # Fiecare caracter: rotit, cu poziție și culoare ușor diferite
        glyph = Image.new("RGBA", (50, 56), (0, 0, 0, 0))
        ImageDraw.Draw(glyph).text((8, 2), char, font=font, fill=(rng.randint(10, 90), rng.randint(10, 90), rng.randint(60, 140)))
        glyph = glyph.rotate(rng.uniform(-28, 28), resample=Image.Resampling.BICUBIC, expand=False)
        image.paste(glyph, (12 + i * 40 + rng.randint(-4, 4), rng.randint(0, 8)), glyph)

    image = image.filter(ImageFilter.SMOOTH)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def create_captcha() -> dict[str, str]:
    """Un CAPTCHA nou: tokenul (de trimis înapoi la înregistrare) și imaginea (data URL)."""
    code = "".join(secrets.choice(ALPHABET) for _ in range(CODE_LENGTH))
    captcha_id = secrets.token_hex(8)
    token = jwt.encode(
        {
            "type": TOKEN_TYPE,
            "jti": captcha_id,
            "h": _digest(code, captcha_id),
            "exp": datetime.now(timezone.utc) + timedelta(seconds=TTL_SECONDS),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    image = base64.b64encode(_render(code)).decode()
    return {"token": token, "image": f"data:image/png;base64,{image}"}


def verify_captcha(token: str | None, answer: str | None) -> None:
    """Aruncă CaptchaError dacă răspunsul nu e bun. Tokenul se consumă chiar și la greșeală."""
    if not token or not answer:
        raise CaptchaError("Completează codul din imagine")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise CaptchaError("Codul din imagine a expirat. Încearcă unul nou") from exc
    except jwt.InvalidTokenError as exc:
        raise CaptchaError("Cod de verificare invalid") from exc
    if payload.get("type") != TOKEN_TYPE:
        raise CaptchaError("Cod de verificare invalid")

    now = time.time()
    for used_id, expires in list(_used.items()):  # curățăm id-urile expirate
        if expires < now:
            del _used[used_id]
    captcha_id = payload["jti"]
    if captcha_id in _used:
        raise CaptchaError("Codul din imagine a fost deja folosit. Încearcă unul nou")
    _used[captcha_id] = payload["exp"]

    # compare_digest: comparație în timp constant (nu dezvăluie prin timp câte caractere erau bune)
    if not hmac.compare_digest(_digest(answer.strip(), captcha_id), payload["h"]):
        raise CaptchaError("Codul din imagine este greșit")
