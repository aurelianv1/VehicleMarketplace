from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import PaymentStatus

if TYPE_CHECKING:
    from app.models.listing import Listing


class Payment(Base):
    """O plată Stripe pentru promovarea unui anunț.

    Perioada de promovare stă AICI, nu ca o coloană în listings: s-ar putea deduce din
    plăți, deci ar fi date redundante (3NF). Un anunț e promovat dacă are o plată
    confirmată cu promoted_until în viitor.
    """

    __tablename__ = "payments"
    # Interogarea „e promovat acum?” caută după anunț și status
    __table_args__ = (Index("ix_payments_listing_status", "listing_id", "status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # Id-ul sesiunii Stripe Checkout; unic, ca aceeași plată să nu fie aplicată de două ori
    stripe_session_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    # Suma în cenți (500 = 5,00 €): întregii nu au erori de rotunjire, iar Stripe lucrează la fel
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status"), default=PaymentStatus.pending, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    promoted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    listing: Mapped["Listing"] = relationship()
