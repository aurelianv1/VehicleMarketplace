"""CAPTCHA: răspuns corect / greșit, folosire unică, expirare."""

import base64
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.core.config import settings
from app.services import captcha
from app.services.captcha import CaptchaError, create_captcha, verify_captcha


def make_token(code: str, captcha_id: str, expires_in: int = 60) -> str:
    """Un token construit ca în create_captcha, dar cu un cod cunoscut de test."""
    return jwt.encode(
        {
            "type": captcha.TOKEN_TYPE,
            "jti": captcha_id,
            "h": captcha._digest(code, captcha_id),
            "exp": datetime.now(timezone.utc) + timedelta(seconds=expires_in),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def test_create_returns_png_image_and_token_without_the_code():
    result = create_captcha()
    assert result["image"].startswith("data:image/png;base64,")
    png = base64.b64decode(result["image"].split(",", 1)[1])
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    # Tokenul se poate decoda de oricine, dar conține doar amprenta, nu codul
    payload = jwt.decode(result["token"], options={"verify_signature": False})
    assert set(payload) == {"type", "jti", "h", "exp"}


def test_correct_answer_passes_case_insensitive():
    verify_captcha(make_token("K7MX", "test-ok"), "k7mx ")


def test_wrong_answer_is_rejected():
    with pytest.raises(CaptchaError, match="greșit"):
        verify_captcha(make_token("K7MX", "test-wrong"), "AAAA")


def test_captcha_can_be_used_only_once():
    token = make_token("K7MX", "test-once")
    verify_captcha(token, "K7MX")
    with pytest.raises(CaptchaError, match="deja folosit"):
        verify_captcha(token, "K7MX")


def test_expired_captcha_is_rejected():
    with pytest.raises(CaptchaError, match="expirat"):
        verify_captcha(make_token("K7MX", "test-expired", expires_in=-1), "K7MX")


def test_token_signed_with_another_key_is_rejected():
    forged = jwt.encode({"type": "captcha", "jti": "x", "h": "y", "exp": 9999999999}, "o-alta-cheie-secreta-de-cel-putin-32-octeti", algorithm="HS256")
    with pytest.raises(CaptchaError, match="invalid"):
        verify_captcha(forged, "K7MX")


def test_missing_answer_is_rejected():
    with pytest.raises(CaptchaError, match="Completează"):
        verify_captcha(make_token("K7MX", "test-empty"), "")
