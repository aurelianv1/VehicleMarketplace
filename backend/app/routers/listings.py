from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.models.enums import BodyType, FuelType, ListingStatus, Transmission
from app.models.listing import Listing
from app.models.user import User
from app.schemas.listing import ListingCard, ListingCreate, ListingRead, ListingUpdate, Page
from app.services import listing_service as svc
from app.services.storage import delete_listing_folder

router = APIRouter(prefix="/listings", tags=["listings"])

SortBy = Literal["recent", "price_asc", "price_desc", "year_desc", "mileage_asc"]

SORT_OPTIONS = {
    "recent": Listing.created_at.desc(),
    "price_asc": Listing.price.asc(),
    "price_desc": Listing.price.desc(),
    "year_desc": Listing.year.desc(),
    "mileage_asc": Listing.mileage_km.asc(),
}


def _get_or_404(db, listing_id: int) -> Listing:
    listing = db.scalar(
        select(Listing)
        .where(Listing.id == listing_id)
        .options(selectinload(Listing.images), selectinload(Listing.owner))
    )
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anunțul nu există")
    return listing


def _require_owner(listing: Listing, user: User) -> None:
    if listing.user_id != user.id and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nu îți aparține acest anunț")


@router.get("", response_model=Page[ListingCard])
def list_listings(
    db: DbSession,
    viewer: OptionalUser,
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(ge=1, le=60)] = 12,
    sort: SortBy = "recent",
    q: Annotated[str | None, Query(max_length=120)] = None,
    brand: str | None = None,
    model: str | None = None,
    city: str | None = None,
    price_min: Annotated[Decimal | None, Query(ge=0)] = None,
    price_max: Annotated[Decimal | None, Query(ge=0)] = None,
    year_min: Annotated[int | None, Query(ge=1900)] = None,
    year_max: Annotated[int | None, Query(ge=1900)] = None,
    mileage_max: Annotated[int | None, Query(ge=0)] = None,
    fuel_type: FuelType | None = None,
    transmission: Transmission | None = None,
    body_type: BodyType | None = None,
) -> Page[ListingCard]:
    """Lista publică de anunțuri. Doar anunțurile publicate sunt vizibile."""
    conditions = [Listing.status == ListingStatus.active]

    if q:
        pattern = f"%{q.strip()}%"
        conditions.append(
            or_(
                Listing.title.ilike(pattern),
                Listing.description.ilike(pattern),
                Listing.brand.ilike(pattern),
                Listing.model.ilike(pattern),
            )
        )
    if brand:
        conditions.append(Listing.brand.ilike(brand.strip()))
    if model:
        conditions.append(Listing.model.ilike(model.strip()))
    if city:
        conditions.append(Listing.city.ilike(city.strip()))
    if price_min is not None:
        conditions.append(Listing.price >= price_min)
    if price_max is not None:
        conditions.append(Listing.price <= price_max)
    if year_min is not None:
        conditions.append(Listing.year >= year_min)
    if year_max is not None:
        conditions.append(Listing.year <= year_max)
    if mileage_max is not None:
        conditions.append(Listing.mileage_km <= mileage_max)
    if fuel_type is not None:
        conditions.append(Listing.fuel_type == fuel_type)
    if transmission is not None:
        conditions.append(Listing.transmission == transmission)
    if body_type is not None:
        conditions.append(Listing.body_type == body_type)

    total = db.scalar(select(func.count(Listing.id)).where(*conditions)) or 0

    rows = db.scalars(
        select(Listing)
        .where(*conditions)
        .options(selectinload(Listing.images))
        # id-ul departajează valorile egale: fără el, ordinea între pagini nu e garantată
        # și același anunț poate apărea pe două pagini (sau deloc)
        .order_by(SORT_OPTIONS[sort], Listing.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    ).all()

    favorites = svc.favorite_ids(db, viewer, [r.id for r in rows])

    return Page[ListingCard](
        items=[svc.to_card(r, favorites) for r in rows],
        total=total,
        page=page,
        per_page=per_page,
        pages=max(1, -(-total // per_page)),  # împărțire cu rotunjire în sus
    )


@router.get("/mine", response_model=list[ListingCard])
def my_listings(db: DbSession, user: CurrentUser) -> list[ListingCard]:
    """Anunțurile proprii, indiferent de status (inclusiv draft)."""
    rows = db.scalars(
        select(Listing)
        .where(Listing.user_id == user.id)
        .options(selectinload(Listing.images))
        .order_by(Listing.created_at.desc())
    ).all()
    return [svc.to_card(r, set()) for r in rows]


@router.get("/{listing_id}", response_model=ListingRead)
def get_listing(listing_id: int, db: DbSession, viewer: OptionalUser) -> ListingRead:
    listing = _get_or_404(db, listing_id)

    # Un anunț nepublicat e vizibil doar proprietarului și adminilor
    if listing.status == ListingStatus.draft:
        if viewer is None or (viewer.id != listing.user_id and not viewer.is_admin):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Anunțul nu există")

    # Vizualizările proprii nu se numără
    if viewer is None or viewer.id != listing.user_id:
        listing.views += 1
        db.commit()

    favorites = svc.favorite_ids(db, viewer, [listing.id])
    return svc.to_detail(listing, viewer, listing.id in favorites)


@router.post("", response_model=ListingRead, status_code=status.HTTP_201_CREATED)
def create_listing(payload: ListingCreate, db: DbSession, user: CurrentUser) -> ListingRead:
    """Anunțul se creează ca draft, ca să i se poată adăuga poze înainte de publicare."""
    listing = Listing(**payload.model_dump(), user_id=user.id, status=ListingStatus.draft)
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return svc.to_detail(listing, user, False)


@router.patch("/{listing_id}", response_model=ListingRead)
def update_listing(
    listing_id: int, payload: ListingUpdate, db: DbSession, user: CurrentUser
) -> ListingRead:
    listing = _get_or_404(db, listing_id)
    _require_owner(listing, user)

    # Aceeași regulă ca la /publish: altfel PATCH {"status": "active"} ar ocoli-o
    if payload.status == ListingStatus.active and not listing.images:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Adaugă cel puțin o poză înainte de publicare"
        )

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(listing, field, value)

    db.commit()
    db.refresh(listing)
    return svc.to_detail(listing, user, False)


@router.post("/{listing_id}/publish", response_model=ListingRead)
def publish_listing(listing_id: int, db: DbSession, user: CurrentUser) -> ListingRead:
    """Publică anunțul. Cere cel puțin o poză, ca în lista publică să nu apară căsuțe goale."""
    listing = _get_or_404(db, listing_id)
    _require_owner(listing, user)

    if not listing.images:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Adaugă cel puțin o poză înainte de publicare"
        )

    listing.status = ListingStatus.active
    db.commit()
    db.refresh(listing)
    return svc.to_detail(listing, user, False)


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_listing(listing_id: int, db: DbSession, user: CurrentUser) -> None:
    listing = _get_or_404(db, listing_id)
    _require_owner(listing, user)

    db.delete(listing)   # rândurile din car_images dispar prin CASCADE
    db.commit()
    delete_listing_folder(listing_id)   # fișierele de pe disc trebuie șterse separat
