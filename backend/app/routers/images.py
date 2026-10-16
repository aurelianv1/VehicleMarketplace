from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.models.car_image import CarImage
from app.models.listing import Listing
from app.models.user import User
from app.schemas.car_image import CarImageRead, CarImageUpdate
from app.services import listing_service as svc
from app.services.storage import ImageValidationError, delete_image_files, save_image

router = APIRouter(prefix="/listings/{listing_id}/images", tags=["images"])


def _owned_listing(db, listing_id: int, user: User) -> Listing:
    listing = db.scalar(
        select(Listing).where(Listing.id == listing_id).options(selectinload(Listing.images))
    )
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anunțul nu există")
    if listing.user_id != user.id and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nu îți aparține acest anunț")
    return listing


@router.get("", response_model=list[CarImageRead])
def list_images(listing_id: int, db: DbSession) -> list[CarImage]:
    return list(
        db.scalars(
            select(CarImage)
            .where(CarImage.listing_id == listing_id)
            .order_by(CarImage.position)
        ).all()
    )


@router.post("", response_model=list[CarImageRead], status_code=status.HTTP_201_CREATED)
async def upload_images(
    listing_id: int,
    db: DbSession,
    user: CurrentUser,
    files: list[UploadFile] = File(...),
) -> list[CarImage]:
    """Încarcă una sau mai multe poze. Fiecare e salvată în trei dimensiuni."""
    listing = _owned_listing(db, listing_id, user)

    existing = len(listing.images)
    if existing + len(files) > settings.MAX_IMAGES_PER_LISTING:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Un anunț poate avea cel mult {settings.MAX_IMAGES_PER_LISTING} poze "
            f"(ai deja {existing})",
        )

    next_position = db.scalar(
        select(func.coalesce(func.max(CarImage.position), -1)).where(
            CarImage.listing_id == listing_id
        )
    )
    next_position = (next_position or -1) + 1

    created: list[CarImage] = []
    for upload in files:
        raw = await upload.read()
        try:
            paths = save_image(listing_id, raw)
        except ImageValidationError as exc:
            # Pozele salvate până acum rămân; raportăm fișierul problematic
            db.commit()
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"{upload.filename}: {exc}"
            ) from exc

        image = CarImage(
            listing_id=listing_id,
            position=next_position,
            # Prima poză a anunțului devine automat poza principală
            is_main=(existing == 0 and next_position == 0),
            **paths,
        )
        db.add(image)
        created.append(image)
        next_position += 1

    db.commit()
    for image in created:
        db.refresh(image)
    return created


@router.patch("/{image_id}", response_model=CarImageRead)
def update_image(
    listing_id: int, image_id: int, payload: CarImageUpdate, db: DbSession, user: CurrentUser
) -> CarImage:
    _owned_listing(db, listing_id, user)

    image = db.scalar(
        select(CarImage).where(CarImage.id == image_id, CarImage.listing_id == listing_id)
    )
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Poza nu există")

    if payload.position is not None:
        image.position = payload.position
    if payload.is_main:
        svc.normalize_main_image(db, listing_id, image_id)

    db.commit()
    db.refresh(image)
    return image


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(listing_id: int, image_id: int, db: DbSession, user: CurrentUser) -> None:
    _owned_listing(db, listing_id, user)

    image = db.scalar(
        select(CarImage).where(CarImage.id == image_id, CarImage.listing_id == listing_id)
    )
    if image is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Poza nu există")

    was_main = image.is_main
    delete_image_files([image.url, image.url_medium, image.url_thumb])
    db.delete(image)
    db.commit()

    # Dacă am șters poza principală, prima rămasă îi ia locul
    if was_main:
        replacement = db.scalar(
            select(CarImage)
            .where(CarImage.listing_id == listing_id)
            .order_by(CarImage.position)
            .limit(1)
        )
        if replacement is not None:
            replacement.is_main = True
            db.commit()
