from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import Currency, ListingStatus

MAX_MESSAGE_LENGTH = 2000


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_MESSAGE_LENGTH)

    @field_validator("body")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Mesajul nu poate fi gol")
        return v


class ConversationStart(MessageCreate):
    """Primul mesaj către vânzător, trimis de pe pagina anunțului."""

    listing_id: int


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    sender_id: int
    body: str
    created_at: datetime
    read_at: datetime | None


class ConversationListing(BaseModel):
    id: int
    title: str
    price: Decimal
    currency: Currency
    status: ListingStatus
    main_image: str | None


class ConversationUser(BaseModel):
    id: int
    full_name: str


class ConversationRead(BaseModel):
    id: int
    listing: ConversationListing
    other_user: ConversationUser
    # Rolul utilizatorului curent în conversație: a întrebat el sau i s-a scris lui
    role: Literal["buyer", "seller"]
    last_message: MessageRead | None
    unread_count: int
    last_message_at: datetime


class ConversationDetail(ConversationRead):
    messages: list[MessageRead]
