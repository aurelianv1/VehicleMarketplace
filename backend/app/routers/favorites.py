from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.activity import log_action
from app.core.deps import CurrentUser, DbSession
from app.models.enums import ListingStatus
from app.models.favorite import Favorite
from app.models.listing import Listing
from app.schemas.listing import ListingCard
from app.services import listing_service as svc
from app.services import payments as pay

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("", response_model=list[ListingCard])
def my_favorites(db: DbSession, user: CurrentUser) -> list[ListingCard]:
    rows = db.scalars(
        select(Listing)
        .join(Favorite, Favorite.listing_id == Listing.id)
        .where(Favorite.user_id == user.id)
        .options(selectinload(Listing.images))
        .order_by(Favorite.created_at.desc())
    ).all()

    all_ids = {r.id for r in rows}
    promoted_map = pay.promoted_ids(db, list(all_ids))
    return [svc.to_card(r, all_ids, promoted_map) for r in rows]


@router.post("/{listing_id}", status_code=status.HTTP_201_CREATED)
def add_favorite(listing_id: int, db: DbSession, user: CurrentUser) -> dict[str, bool]:
    listing = db.get(Listing, listing_id)
    if listing is None or listing.status == ListingStatus.draft:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anunțul nu există")

    exists = db.scalar(
        select(Favorite).where(
            Favorite.user_id == user.id, Favorite.listing_id == listing_id
        )
    )
    if exists is None:
        db.add(Favorite(user_id=user.id, listing_id=listing_id))
        db.commit()
        log_action("favorite.add", user.id, listing=listing_id)

    return {"is_favorite": True}


@router.delete("/{listing_id}", status_code=status.HTTP_200_OK)
def remove_favorite(listing_id: int, db: DbSession, user: CurrentUser) -> dict[str, bool]:
    favorite = db.scalar(
        select(Favorite).where(
            Favorite.user_id == user.id, Favorite.listing_id == listing_id
        )
    )
    if favorite is not None:
        db.delete(favorite)
        db.commit()
        log_action("favorite.remove", user.id, listing=listing_id)

    return {"is_favorite": False}
