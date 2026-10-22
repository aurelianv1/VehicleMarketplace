from datetime import datetime
from decimal import Decimal
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import (
    BodyType,
    CarCondition,
    Currency,
    FuelType,
    ListingStatus,
    Transmission,
)
from app.schemas.car_image import CarImageRead
from app.schemas.user import UserPublic

CURRENT_YEAR = datetime.now().year

Year = Annotated[int, Field(ge=1900, le=CURRENT_YEAR + 1)]
Price = Annotated[Decimal, Field(gt=0, le=Decimal("99999999.99"))]
Mileage = Annotated[int, Field(ge=0, le=2_000_000)]


class ListingBase(BaseModel):
    title: str = Field(min_length=5, max_length=160)
    brand: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    year: Year
    price: Price
    currency: Currency = Currency.EUR
    mileage_km: Mileage
    fuel_type: FuelType
    transmission: Transmission
    body_type: BodyType | None = None
    engine_capacity: int | None = Field(default=None, ge=0, le=10_000)
    horsepower: int | None = Field(default=None, ge=0, le=2_000)
    color: str | None = Field(default=None, max_length=40)
    condition: CarCondition = CarCondition.used
    description: str | None = Field(default=None, max_length=5000)
    city: str = Field(min_length=2, max_length=80)

    @field_validator("brand", "model", "city", "title")
    @classmethod
    def strip_text(cls, v: str) -> str:
        return v.strip()


class ListingCreate(ListingBase):
    pass


class ListingUpdate(BaseModel):
    """Toate câmpurile opționale: se trimite doar ce se schimbă."""

    title: str | None = Field(default=None, min_length=5, max_length=160)
    brand: str | None = Field(default=None, min_length=1, max_length=60)
    model: str | None = Field(default=None, min_length=1, max_length=60)
    year: Year | None = None
    price: Price | None = None
    currency: Currency | None = None
    mileage_km: Mileage | None = None
    fuel_type: FuelType | None = None
    transmission: Transmission | None = None
    body_type: BodyType | None = None
    engine_capacity: int | None = Field(default=None, ge=0, le=10_000)
    horsepower: int | None = Field(default=None, ge=0, le=2_000)
    color: str | None = Field(default=None, max_length=40)
    condition: CarCondition | None = None
    description: str | None = Field(default=None, max_length=5000)
    city: str | None = Field(default=None, min_length=2, max_length=80)
    status: ListingStatus | None = None


class ListingCard(BaseModel):
    """Varianta scurtă, pentru lista de pe pagina principală."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    brand: str
    model: str
    year: int
    price: Decimal
    currency: Currency
    mileage_km: int
    fuel_type: FuelType
    transmission: Transmission
    city: str
    status: ListingStatus
    created_at: datetime
    main_image: str | None = None
    is_favorite: bool = False
    # Setat doar dacă anunțul e promovat ACUM (plată Stripe confirmată, perioadă neexpirată)
    promoted_until: datetime | None = None


class ListingRead(ListingBase):
    """Varianta completă, pentru pagina de detaliu."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    status: ListingStatus
    views: int
    created_at: datetime
    updated_at: datetime
    owner: UserPublic
    images: list[CarImageRead] = []
    is_favorite: bool = False
    promoted_until: datetime | None = None
    # Telefonul vânzătorului: completat doar pentru utilizatorii autentificați
    seller_phone: str | None = None


T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    per_page: int
    pages: int
