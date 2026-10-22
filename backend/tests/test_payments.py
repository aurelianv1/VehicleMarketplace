"""Promovarea prin Stripe, cu Stripe simulat (fără cont, fără internet) și o bază SQLite în memorie."""

import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import Base
from app.models.enums import FuelType, ListingStatus, PaymentStatus, Transmission
from app.models.listing import Listing
from app.models.payment import Payment
from app.models.user import User
from app.services import payments as pay


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(email="ion@example.com", password_hash="x", full_name="Ion")
        session.add(user)
        session.flush()
        session.add(Listing(
            id=1, user_id=user.id, title="Dacia Logan 2015", brand="Dacia", model="Logan", year=2015,
            price=4500, mileage_km=1, fuel_type=FuelType.diesel, transmission=Transmission.manual,
            city="Arad", status=ListingStatus.active,
        ))
        session.commit()
        yield session


@pytest.fixture
def stripe_mock(monkeypatch):
    """Înlocuiește clientul Stripe; testul alege ce răspunde „Stripe”."""
    client = MagicMock()
    monkeypatch.setattr(pay, "_client", lambda: client)
    return client


def add_pending(db, session_id="cs_test_1"):
    db.add(Payment(listing_id=1, user_id=1, stripe_session_id=session_id, amount_cents=500, currency="EUR"))
    db.commit()


def as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)  # SQLite nu păstrează fusul orar


def test_paid_session_promotes_the_listing_for_the_configured_days(db, stripe_mock):
    add_pending(db)
    stripe_mock.v1.checkout.sessions.retrieve.return_value = SimpleNamespace(payment_status="paid", status="complete")
    payment = pay.confirm(db, "cs_test_1")
    assert payment.status == PaymentStatus.paid
    expected = datetime.now(timezone.utc) + timedelta(days=settings.PROMOTION_DAYS)
    assert abs((as_utc(payment.promoted_until) - expected).total_seconds()) < 5


def test_confirming_twice_does_not_extend_twice(db, stripe_mock):
    # Pagina de succes și webhook-ul pot confirma aceeași plată
    add_pending(db)
    stripe_mock.v1.checkout.sessions.retrieve.return_value = SimpleNamespace(payment_status="paid", status="complete")
    first = pay.confirm(db, "cs_test_1").promoted_until
    second = pay.confirm(db, "cs_test_1").promoted_until
    assert first == second
    assert stripe_mock.v1.checkout.sessions.retrieve.call_count == 1  # a doua oară nici nu mai întreabă Stripe


def test_second_payment_extends_from_the_end_of_the_first(db, stripe_mock):
    stripe_mock.v1.checkout.sessions.retrieve.return_value = SimpleNamespace(payment_status="paid", status="complete")
    add_pending(db, "cs_test_a")
    add_pending(db, "cs_test_b")
    first_end = as_utc(pay.confirm(db, "cs_test_a").promoted_until)
    second_end = as_utc(pay.confirm(db, "cs_test_b").promoted_until)
    assert second_end - first_end == timedelta(days=settings.PROMOTION_DAYS)


def test_unpaid_session_stays_pending_and_expired_is_marked(db, stripe_mock):
    add_pending(db)
    stripe_mock.v1.checkout.sessions.retrieve.return_value = SimpleNamespace(payment_status="unpaid", status="open")
    assert pay.confirm(db, "cs_test_1").status == PaymentStatus.pending
    stripe_mock.v1.checkout.sessions.retrieve.return_value = SimpleNamespace(payment_status="unpaid", status="expired")
    assert pay.confirm(db, "cs_test_1").status == PaymentStatus.expired
    assert pay.promoted_ids(db, [1]) == {}


def test_unknown_session_is_rejected(db, stripe_mock):
    with pytest.raises(pay.PaymentError):
        pay.confirm(db, "cs_test_inexistent")


def test_checkout_needs_a_stripe_key(db, monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_SECRET_KEY", "")
    with pytest.raises(pay.PaymentsDisabled):
        pay.create_checkout(db, db.get(Listing, 1), db.get(User, 1))


def test_checkout_saves_a_pending_payment(db, stripe_mock):
    stripe_mock.v1.checkout.sessions.create.return_value = SimpleNamespace(id="cs_test_nou", url="https://checkout.stripe.com/c/pay/cs_test_nou")
    url = pay.create_checkout(db, db.get(Listing, 1), db.get(User, 1))
    assert url.startswith("https://checkout.stripe.com/")
    params = stripe_mock.v1.checkout.sessions.create.call_args.kwargs["params"]
    assert params["line_items"][0]["price_data"]["unit_amount"] == settings.PROMOTION_PRICE_CENTS
    assert "{CHECKOUT_SESSION_ID}" in params["success_url"]
    saved = db.query(Payment).filter_by(stripe_session_id="cs_test_nou").one()
    assert saved.status == PaymentStatus.pending


def signed(payload: bytes, secret: str) -> str:
    timestamp = int(time.time())
    signature = hmac.new(secret.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={signature}"


def test_webhook_with_valid_signature_is_accepted(monkeypatch):
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", "whsec_test_secret")
    payload = json.dumps({"id": "evt_1", "object": "event", "type": "checkout.session.completed", "data": {"object": {"id": "cs_test_1"}}}).encode()
    event = pay.parse_webhook(payload, signed(payload, "whsec_test_secret"))
    assert event.type == "checkout.session.completed"


def test_webhook_with_forged_signature_is_rejected(monkeypatch):
    # Fără verificarea semnăturii, oricine ar putea „confirma” o plată trimițând un JSON
    monkeypatch.setattr(settings, "STRIPE_WEBHOOK_SECRET", "whsec_test_secret")
    payload = b'{"type": "checkout.session.completed"}'
    with pytest.raises(pay.PaymentError):
        pay.parse_webhook(payload, signed(payload, "alta-cheie"))
