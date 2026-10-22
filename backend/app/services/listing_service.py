"""Funcții ajutătoare pentru transformarea anunțurilor în răspunsuri API."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.car_image import CarImage
from app.models.favorite import Favorite
from app.models.listing import Listing
from app.models.user import User
from app.schemas.listing import ListingCard, ListingRead


def favorite_ids(db: Session, user: User | None, listing_ids: list[int]) -> set[int]:
    """Un singur query pentru toate anunțurile din pagină, nu unul per anunț."""
    if user is None or not listing_ids:
        return set()

    rows = db.scalars(
        select(Favorite.listing_id).where(
            Favorite.user_id == user.id, Favorite.listing_id.in_(listing_ids)
        )
    ).all()
    return set(rows)


def main_image_url(listing: Listing) -> str | None:
    """Poza principală, sau prima din galerie dacă niciuna nu e marcată."""
    if not listing.images:
        return None

    main = next((img for img in listing.images if img.is_main), listing.images[0])
    return main.url_medium or main.url


def to_card(listing: Listing, favorites: set[int], promoted: dict[int, datetime] | None = None) -> ListingCard:
    card = ListingCard.model_validate(listing)
    card.main_image = main_image_url(listing)
    card.is_favorite = listing.id in favorites
    card.promoted_until = (promoted or {}).get(listing.id)
    return card


def to_detail(
    listing: Listing, viewer: User | None, is_favorite: bool, promoted_until: datetime | None = None
) -> ListingRead:
    detail = ListingRead.model_validate(listing)
    detail.is_favorite = is_favorite
    detail.promoted_until = promoted_until
    # Numărul de telefon nu e public: altfel ar fi colectat automat de roboți
    detail.seller_phone = listing.owner.phone if viewer is not None else None
    return detail


def normalize_main_image(db: Session, listing_id: int, main_image_id: int) -> None:
    """Se asigură că un singur rând are is_main = True pentru un anunț."""
    images = db.scalars(select(CarImage).where(CarImage.listing_id == listing_id)).all()
    for image in images:
        image.is_main = image.id == main_image_id
