"""Validarea datelor primite (Pydantic) și jurnalul de activitate."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.core.activity import LOG_FILE, log_action
from app.schemas.listing import ListingCreate
from app.schemas.message import MessageCreate

VALID_LISTING = {
    "title": "Dacia Logan 2015",
    "brand": " Dacia ",
    "model": "Logan",
    "year": 2015,
    "price": "4500.50",
    "mileage_km": 120000,
    "fuel_type": "diesel",
    "transmission": "manual",
    "city": "Arad",
}


def test_valid_listing_is_accepted_and_trimmed():
    listing = ListingCreate(**VALID_LISTING)
    assert listing.brand == "Dacia"
    assert listing.price == Decimal("4500.50")  # Decimal, nu float: fără erori de rotunjire


@pytest.mark.parametrize(
    "field, value",
    [("price", 0), ("price", -10), ("year", 1800), ("mileage_km", -1), ("title", "abc"), ("fuel_type", "abur")],
)
def test_invalid_listing_values_are_rejected(field, value):
    with pytest.raises(ValidationError):
        ListingCreate(**{**VALID_LISTING, field: value})


def test_blank_message_is_rejected():
    with pytest.raises(ValidationError):
        MessageCreate(body="    ")


def test_message_is_trimmed_and_limited():
    assert MessageCreate(body="  Salut!  ").body == "Salut!"
    with pytest.raises(ValidationError):
        MessageCreate(body="x" * 2001)


def test_activity_log_writes_one_line_without_newlines():
    log_action("test.unit", 99, nota='Text cu\nEnter și "ghilimele"')
    last = LOG_FILE.read_text(encoding="utf-8").splitlines()[-1]
    assert "user=99 | test.unit" in last
    assert "Text cu Enter" in last  # rândul nou din text nu sparge jurnalul în două
