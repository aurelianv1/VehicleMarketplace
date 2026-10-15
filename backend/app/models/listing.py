from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import (
    BodyType,
    CarCondition,
    Currency,
    FuelType,
    ListingStatus,
    Transmission,
)

if TYPE_CHECKING:
    from app.models.car_image import CarImage
    from app.models.favorite import Favorite
    from app.models.user import User


class Listing(Base, TimestampMixin):
    __tablename__ = "listings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    brand: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    model: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # Numeric, nu Float: prețurile nu trebuie să sufere erori de rotunjire
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, index=True)
    currency: Mapped[Currency] = mapped_column(
        SAEnum(Currency, name="currency"), default=Currency.EUR, nullable=False
    )

    mileage_km: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    fuel_type: Mapped[FuelType] = mapped_column(
        SAEnum(FuelType, name="fuel_type"), nullable=False, index=True
    )
    transmission: Mapped[Transmission] = mapped_column(
        SAEnum(Transmission, name="transmission"), nullable=False, index=True
    )
    body_type: Mapped[BodyType | None] = mapped_column(SAEnum(BodyType, name="body_type"))
    engine_capacity: Mapped[int | None] = mapped_column(Integer)   # cmc
    horsepower: Mapped[int | None] = mapped_column(Integer)        # CP
    color: Mapped[str | None] = mapped_column(String(40))
    condition: Mapped[CarCondition] = mapped_column(
        SAEnum(CarCondition, name="car_condition"), default=CarCondition.used, nullable=False
    )

    description: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str] = mapped_column(String(80), nullable=False, index=True)

    status: Mapped[ListingStatus] = mapped_column(
        SAEnum(ListingStatus, name="listing_status"),
        default=ListingStatus.draft,
        nullable=False,
        index=True,
    )
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    owner: Mapped["User"] = relationship(back_populates="listings")
    images: Mapped[list["CarImage"]] = relationship(
        back_populates="listing",
        cascade="all, delete-orphan",
        order_by="CarImage.position",
    )
    favorited_by: Mapped[list["Favorite"]] = relationship(
        back_populates="listing", cascade="all, delete-orphan"
    )

    # Index compus: cel mai frecvent filtru din pagina principală
    __table_args__ = (Index("ix_listings_status_created", "status", "created_at"),)

    def __repr__(self) -> str:
        return f"<Listing {self.id} {self.brand} {self.model}>"
