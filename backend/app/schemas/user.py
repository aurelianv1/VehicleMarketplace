from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72, description="Minim 8 caractere")
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    # Primite de la GET /auth/captcha și completate de utilizator (vezi services/captcha.py)
    captcha_token: str = Field(max_length=1000)
    captcha_answer: str = Field(max_length=20)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)


class UserPublic(BaseModel):
    """Datele vizibile pe pagina unui anunț (fără telefon)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    created_at: datetime


class UserRead(UserPublic):
    """Datele proprii ale utilizatorului autentificat."""

    email: EmailStr
    phone: str | None = None
    is_admin: bool
