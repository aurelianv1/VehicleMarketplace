import logging
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.activity import log_action
from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.models.enums import ListingStatus, PaymentStatus
from app.models.listing import Listing
from app.models.payment import Payment
from app.services import payments as pay

router = APIRouter(tags=["payments"])

NOT_CONFIGURED = "Plățile nu sunt configurate pe acest server"


class CheckoutResponse(BaseModel):
    checkout_url: str


class ConfirmRequest(BaseModel):
    session_id: str = Field(min_length=10, max_length=255)


class PaymentRead(BaseModel):
    id: int
    listing_id: int
    listing_title: str
    amount_cents: int
    currency: str
    status: PaymentStatus
    created_at: datetime
    paid_at: datetime | None
    promoted_until: datetime | None


def _to_read(p: Payment) -> PaymentRead:
    return PaymentRead(
        id=p.id, listing_id=p.listing_id, listing_title=p.listing.title, amount_cents=p.amount_cents,
        currency=p.currency, status=p.status, created_at=p.created_at, paid_at=p.paid_at,
        promoted_until=p.promoted_until,
    )


@router.get("/payments/config")
def payments_config() -> dict[str, object]:
    """Pentru interfață: e disponibilă promovarea și cât costă?"""
    return {
        "enabled": bool(settings.STRIPE_SECRET_KEY),
        "price_cents": settings.PROMOTION_PRICE_CENTS,
        "currency": settings.PROMOTION_CURRENCY.upper(),
        "days": settings.PROMOTION_DAYS,
    }


@router.post("/listings/{listing_id}/promote", response_model=CheckoutResponse)
def promote_listing(listing_id: int, db: DbSession, user: CurrentUser) -> CheckoutResponse:
    """Creează plata Stripe pentru promovarea anunțului; frontend-ul redirecționează la checkout_url."""
    listing = db.get(Listing, listing_id)
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anunțul nu există")
    if listing.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Poți promova doar anunțurile tale")
    if listing.status != ListingStatus.active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Doar anunțurile publicate pot fi promovate")

    try:
        url = pay.create_checkout(db, listing, user)
    except pay.PaymentsDisabled as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_CONFIGURED) from exc
    except pay.PaymentError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    log_action("payment.checkout", user.id, listing=listing.id, amount_cents=settings.PROMOTION_PRICE_CENTS)
    return CheckoutResponse(checkout_url=url)


@router.post("/payments/confirm", response_model=PaymentRead)
def confirm_payment(payload: ConfirmRequest, db: DbSession, user: CurrentUser) -> PaymentRead:
    """Apelat de pagina de succes. Starea plății se citește de la Stripe, nu din browser."""
    owner_id = db.scalar(select(Payment.user_id).where(Payment.stripe_session_id == payload.session_id))
    if owner_id is None or (owner_id != user.id and not user.is_admin):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Plata nu există")
    try:
        payment = pay.confirm(db, payload.session_id)
    except pay.PaymentsDisabled as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_CONFIGURED) from exc
    except pay.PaymentError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    if payment.status == PaymentStatus.paid:
        log_action("payment.paid", user.id, listing=payment.listing_id, payment=payment.id)
    db.refresh(payment)
    return _to_read(payment)


@router.get("/payments", response_model=list[PaymentRead])
def my_payments(db: DbSession, user: CurrentUser) -> list[PaymentRead]:
    rows = db.scalars(
        select(Payment)
        .where(Payment.user_id == user.id)
        .options(selectinload(Payment.listing))
        .order_by(Payment.created_at.desc())
    ).all()
    return [_to_read(p) for p in rows]


@router.post("/payments/webhook", include_in_schema=False)
async def stripe_webhook(request: Request, db: DbSession) -> dict[str, bool]:
    """Stripe anunță aici plățile finalizate, chiar dacă utilizatorul a închis tab-ul
    înainte de pagina de succes. Opțional: cere STRIPE_WEBHOOK_SECRET."""
    try:
        event = pay.parse_webhook(await request.body(), request.headers.get("stripe-signature"))
    except pay.PaymentsDisabled as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_CONFIGURED) from exc
    except pay.PaymentError as exc:
        log_action("security.webhook_rejected", level=logging.WARNING)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    if event.type in ("checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired"):
        session_id = event.data.object["id"]
        try:
            payment = pay.confirm(db, session_id)
            log_action("payment.webhook", payment.user_id, payment=payment.id, status=payment.status.value)
        except pay.PaymentError:
            pass  # sesiune creată în alt mediu (ex. alt server de test): o ignorăm
    return {"received": True}
