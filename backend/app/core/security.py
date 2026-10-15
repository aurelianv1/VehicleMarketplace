from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from jwt.exceptions import InvalidTokenError

from app.core.config import settings

ACCESS_TOKEN = "access"
REFRESH_TOKEN = "refresh"

# bcrypt acceptă cel mult 72 de octeți; restul ar fi ignorat în tăcere
BCRYPT_MAX_BYTES = 72


def _to_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_to_bytes(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_to_bytes(plain_password), password_hash.encode("utf-8"))
    except ValueError:
        # hash corupt sau în alt format
        return False


def _create_token(subject: str | int, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(subject: str | int) -> str:
    return _create_token(
        subject, ACCESS_TOKEN, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )


def create_refresh_token(subject: str | int) -> str:
    return _create_token(
        subject, REFRESH_TOKEN, timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )


def decode_token(token: str, expected_type: str) -> int | None:
    """Întoarce id-ul utilizatorului dacă tokenul e valid și de tipul așteptat."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except InvalidTokenError:
        return None

    if payload.get("type") != expected_type:
        return None

    subject = payload.get("sub")
    if subject is None:
        return None

    try:
        return int(subject)
    except (TypeError, ValueError):
        return None