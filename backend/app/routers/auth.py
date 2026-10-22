import logging

from fastapi import APIRouter, Cookie, HTTPException, Response, status
from sqlalchemy import select

from app.core.activity import log_action
from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.security import (
    REFRESH_TOKEN,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.schemas.token import TokenPair
from app.schemas.user import UserCreate, UserLogin, UserRead
from app.services.captcha import CaptchaError, create_captcha, verify_captcha

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"


def _set_refresh_cookie(response: Response, user_id: int) -> None:
    """Refresh token-ul stă în cookie httpOnly: nu poate fi citit din JavaScript."""
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=create_refresh_token(user_id),
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,  # True în producție, pe HTTPS
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        path=settings.REFRESH_COOKIE_PATH,
    )


def _token_pair(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id),
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserRead.model_validate(user),
    )


@router.get("/captcha")
def captcha(response: Response) -> dict[str, str]:
    """Un CAPTCHA nou pentru formularul de înregistrare: {token, image (data URL PNG)}."""
    response.headers["Cache-Control"] = "no-store"  # fiecare cerere trebuie să primească unul nou
    return create_captcha()


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, response: Response, db: DbSession) -> TokenPair:
    # CAPTCHA înainte de orice altceva: un robot nu află nici măcar dacă emailul există
    try:
        verify_captcha(payload.captcha_token, payload.captcha_answer)
    except CaptchaError as exc:
        log_action("security.captcha_failed", level=logging.WARNING, reason=str(exc))
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    email = payload.email.lower().strip()

    exists = db.scalar(select(User).where(User.email == email))
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Există deja un cont cu acest email")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name.strip(),
        phone=payload.phone,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    log_action("auth.register", user.id, email=user.email)
    _set_refresh_cookie(response, user.id)
    return _token_pair(user)


@router.post("/login", response_model=TokenPair)
def login(payload: UserLogin, response: Response, db: DbSession) -> TokenPair:
    user = db.scalar(select(User).where(User.email == payload.email.lower().strip()))

    # Același mesaj pentru email greșit și parolă greșită, ca să nu dezvăluim ce conturi există
    if user is None or not verify_password(payload.password, user.password_hash):
        # Încercările eșuate apar în jurnal: un șir lung de la același IP înseamnă ghicire de parole
        log_action("auth.login_failed", level=logging.WARNING, email=payload.email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email sau parolă incorecte")

    if not user.is_active:
        log_action("auth.login_blocked", user.id, level=logging.WARNING)
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Contul este dezactivat")

    log_action("auth.login", user.id)
    _set_refresh_cookie(response, user.id)
    return _token_pair(user)


@router.post("/refresh", response_model=TokenPair)
def refresh(
    response: Response,
    db: DbSession,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
) -> TokenPair:
    if refresh_token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Lipsește refresh token-ul")

    user_id = decode_token(refresh_token, REFRESH_TOKEN)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token invalid sau expirat")

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Utilizator inexistent")

    _set_refresh_cookie(response, user.id)
    return _token_pair(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    log_action("auth.logout")
    response.delete_cookie(REFRESH_COOKIE, path=settings.REFRESH_COOKIE_PATH)


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser) -> User:
    return user
