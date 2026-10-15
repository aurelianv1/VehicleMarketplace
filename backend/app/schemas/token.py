from pydantic import BaseModel

from app.schemas.user import UserRead


class TokenPair(BaseModel):
    """Access token în corpul răspunsului; refresh token-ul pleacă în cookie httpOnly."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead
