"""Promovarea anunțurilor prin plată Stripe Checkout (mod TEST).

Fluxul:
1. create_checkout(): salvăm plata ca „pending” și cerem lui Stripe o pagină de plată.
2. Utilizatorul plătește pe pagina Stripe; datele cardului nu trec prin serverul nostru.
3. confirm(): după întoarcere (sau prin webhook) întrebăm DIRECT Stripe dacă sesiunea
   e plătită. Nu ne bazăm pe ce trimite browserul: un utilizator ar putea apela
   pagina de succes fără să fi plătit.
4. Aplicarea e idempotentă: aceeași plată confirmată de două ori (pagina de succes
   + webhook) prelungește promovarea o singură dată.
"""

from datetime import datetime, timedelta, timezone

import stripe
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.enums import PaymentStatus
from app.models.listing import Listing
from app.models.payment import Payment
from app.models.user import User


class PaymentsDisabled(Exception):
    """Lipsește STRIPE_SECRET_KEY: promovarea nu e disponibilă."""


class PaymentError(Exception):
    """Stripe a refuzat cererea sau plata nu poate fi confirmată."""


def promoted_until_expr():
    """Subinterogare corelată: până când e promovat anunțul curent (NULL = niciodată)."""
    return (
        select(func.max(Payment.promoted_until))
        .where(Payment.listing_id == Listing.id, Payment.status == PaymentStatus.paid)
        .correlate(Listing)
        .scalar_subquery()
    )


def promoted_ids(db: Session, listing_ids: list[int]) -> dict[int, datetime]:
    """Pentru anunțurile date, cele promovate acum și până când (o singură interogare)."""
    if not listing_ids:
        return {}
    rows = db.execute(
        select(Payment.listing_id, func.max(Payment.promoted_until))
        .where(Payment.listing_id.in_(listing_ids), Payment.status == PaymentStatus.paid)
        .group_by(Payment.listing_id)
        .having(func.max(Payment.promoted_until) > func.now())
    ).all()
    return dict(rows)


def _client() -> stripe.StripeClient:
    if not settings.STRIPE_SECRET_KEY:
        raise PaymentsDisabled
    return stripe.StripeClient(settings.STRIPE_SECRET_KEY)


def create_checkout(db: Session, listing: Listing, user: User) -> str:
    """Creează sesiunea de plată și întoarce adresa paginii Stripe."""
    client = _client()
    base = settings.PUBLIC_URL.rstrip("/")
    try:
        session = client.v1.checkout.sessions.create(
            params={
                "mode": "payment",
                "line_items": [
                    {
                        "quantity": 1,
                        "price_data": {
                            "currency": settings.PROMOTION_CURRENCY,
                            "unit_amount": settings.PROMOTION_PRICE_CENTS,
                            "product_data": {
                                "name": f"Promovare {settings.PROMOTION_DAYS} zile",
                                "description": listing.title[:200],
                            },
                        },
                    }
                ],
                "customer_email": user.email,
                "metadata": {"listing_id": str(listing.id), "user_id": str(user.id)},
                # {CHECKOUT_SESSION_ID} e completat de Stripe la întoarcere
                "success_url": f"{base}/payments/success?session_id={{CHECKOUT_SESSION_ID}}",
                "cancel_url": f"{base}/listings/{listing.id}?promotion=cancelled",
                "locale": "ro",
                # Sesiunea expiră dacă nu e plătită în 30 de minute (minimul permis de Stripe)
                "expires_at": int((datetime.now(timezone.utc) + timedelta(minutes=30)).timestamp()),
            }
        )
    except stripe.StripeError as exc:
        raise PaymentError(exc.user_message or "Plata nu a putut fi inițiată") from exc

    db.add(
        Payment(
            listing_id=listing.id,
            user_id=user.id,
            stripe_session_id=session.id,
            amount_cents=settings.PROMOTION_PRICE_CENTS,
            currency=settings.PROMOTION_CURRENCY.upper(),
        )
    )
    db.commit()
    return session.url


def apply_paid(db: Session, payment: Payment) -> None:
    """Marchează plata ca achitată și calculează perioada de promovare.

    Dacă anunțul e deja promovat, perioada nouă începe la finalul celei existente
    (două plăți = 14 zile), nu se suprapune.
    """
    if payment.status == PaymentStatus.paid:
        return  # deja aplicată (ex. și de webhook, și de pagina de succes)
    now = datetime.now(timezone.utc)
    current_end = db.scalar(
        select(func.max(Payment.promoted_until)).where(
            Payment.listing_id == payment.listing_id, Payment.status == PaymentStatus.paid
        )
    )
    if current_end and current_end.tzinfo is None:  # unele baze (ex. SQLite) nu păstrează fusul orar
        current_end = current_end.replace(tzinfo=timezone.utc)
    start = max(now, current_end) if current_end else now
    payment.status = PaymentStatus.paid
    payment.paid_at = now
    payment.promoted_until = start + timedelta(days=settings.PROMOTION_DAYS)
    db.commit()


def confirm(db: Session, session_id: str) -> Payment:
    """Verifică la Stripe starea sesiunii și o aplică. Întoarce plata actualizată."""
    # FOR UPDATE: dacă pagina de succes și webhook-ul ajung simultan, a doua cerere
    # așteaptă prima, apoi vede plata deja aplicată
    payment = db.scalar(select(Payment).where(Payment.stripe_session_id == session_id).with_for_update())
    if payment is None:
        raise PaymentError("Plata nu există")
    if payment.status == PaymentStatus.paid:
        return payment

    try:
        session = _client().v1.checkout.sessions.retrieve(session_id)
    except stripe.StripeError as exc:
        raise PaymentError("Plata nu a putut fi verificată la Stripe") from exc

    if session.payment_status == "paid":
        apply_paid(db, payment)
    elif session.status == "expired":
        payment.status = PaymentStatus.expired
        db.commit()
    else:
        db.commit()  # eliberăm blocarea; plata rămâne „pending”
    return payment


def parse_webhook(payload: bytes, signature: str | None) -> stripe.Event:
    """Verifică semnătura webhook-ului: fără ea, oricine ar putea „confirma” plăți."""
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise PaymentsDisabled
    try:
        return stripe.Webhook.construct_event(payload, signature or "", settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise PaymentError("Semnătură invalidă") from exc
