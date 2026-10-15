from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.listing import Listing


class CarImage(Base):
    __tablename__ = "car_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Căile sunt relative la folderul uploads/, ex: listings/42/abc123_full.jpg
    url: Mapped[str] = mapped_column(String(300), nullable=False)
    url_medium: Mapped[str | None] = mapped_column(String(300))
    url_thumb: Mapped[str | None] = mapped_column(String(300))

    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_main: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    listing: Mapped["Listing"] = relationship(back_populates="images")

    def __repr__(self) -> str:
        return f"<CarImage {self.id} listing={self.listing_id}>"
