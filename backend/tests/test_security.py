"""Parole (bcrypt) și token-uri JWT."""

from datetime import timedelta

from app.core import security
from app.core.security import (
    ACCESS_TOKEN,
    REFRESH_TOKEN,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


def test_password_hash_is_not_the_password_and_verifies():
    hashed = hash_password("parola1234")
    assert hashed != "parola1234"
    assert hashed.startswith("$2")  # format bcrypt
    assert verify_password("parola1234", hashed)


def test_wrong_password_is_rejected():
    assert not verify_password("alta-parola", hash_password("parola1234"))


def test_same_password_gives_different_hashes():
    # Salt aleator: două conturi cu aceeași parolă nu au același hash
    assert hash_password("parola1234") != hash_password("parola1234")


def test_corrupt_hash_does_not_crash():
    assert verify_password("parola1234", "nu-e-un-hash") is False


def test_access_token_round_trip():
    assert decode_token(create_access_token(42), ACCESS_TOKEN) == 42


def test_refresh_token_cannot_be_used_as_access_token():
    # Altfel cineva care fură cookie-ul de refresh l-ar putea folosi direct pe API
    assert decode_token(create_refresh_token(42), ACCESS_TOKEN) is None
    assert decode_token(create_refresh_token(42), REFRESH_TOKEN) == 42


def test_expired_token_is_rejected():
    token = security._create_token(42, ACCESS_TOKEN, timedelta(seconds=-1))
    assert decode_token(token, ACCESS_TOKEN) is None


def test_tampered_token_is_rejected():
    token = create_access_token(42)
    header, payload, signature = token.split(".")
    forged = f"{header}.{payload}.{signature[:-2]}xx"
    assert decode_token(forged, ACCESS_TOKEN) is None
