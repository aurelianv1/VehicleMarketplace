from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.listing import Listing
    from app.models.user import User


class Conversation(Base):
    """Discuția dintre un cumpărător și vânzător, despre un anumit anunț."""

    __tablename__ = "conversations"
    # Un cumpărător are o singură conversație per anunț: al doilea „Trimite mesaj”
    # continuă discuția existentă în loc să creeze una nouă
    __table_args__ = (UniqueConstraint("listing_id", "buyer_id", name="uq_conversation_listing_buyer"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    buyer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Pentru sortarea listei: conversația cu cel mai nou mesaj apare prima
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    listing: Mapped["Listing"] = relationship()
    buyer: Mapped["User"] = relationship(foreign_keys=[buyer_id])
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", order_by="Message.id", passive_deletes=True
    )

    # Vânzătorul NU e o coloană aici: e proprietarul anunțului. Dacă l-am salva și în
    # conversations, ar depinde de listing_id (care nu e cheie) → încălcare a 3NF.
    @property
    def seller_id(self) -> int:
        return self.listing.user_id

    @property
    def seller(self) -> "User":
        return self.listing.owner

    def other_user_id(self, user_id: int) -> int:
        return self.seller_id if user_id == self.buyer_id else self.buyer_id


class Message(Base):
    __tablename__ = "messages"
    # Interogarea cea mai frecventă: mesajele unei conversații, în ordine
    __table_args__ = (Index("ix_messages_conversation_id_id", "conversation_id", "id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # null = necitit de destinatar
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
