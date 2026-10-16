"""Populează baza de date cu date de test, pentru demonstrație.

Rulare:  python seed.py
Șterge datele existente și creează 3 conturi și ~30 de anunțuri cu poze.

Pozele sunt generate automat (plăci colorate cu marca și modelul). Dacă vrei
poze reale, le poți încărca din interfață după ce pornești aplicația.
"""

import random
from decimal import Decimal
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import delete, text

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.car_image import CarImage
from app.models.enums import (
    BodyType,
    CarCondition,
    Currency,
    FuelType,
    ListingStatus,
    Transmission,
)
from app.models.favorite import Favorite
from app.models.listing import Listing
from app.models.message import Conversation, Message
from app.models.user import User
from app.services.storage import save_image

random.seed(42)  # aceleași date la fiecare rulare

CITIES = [
    "București", "Cluj-Napoca", "Timișoara", "Iași", "Brașov",
    "Constanța", "Craiova", "Sibiu", "Oradea", "Ploiești",
]

COLORS = ["Negru", "Alb", "Gri", "Argintiu", "Albastru", "Roșu", "Verde"]

# (marcă, model, an_min, an_max, preț_min, preț_max, caroserie)
CARS = [
    ("Volkswagen", "Golf", 2012, 2022, 7000, 24000, BodyType.hatchback),
    ("Volkswagen", "Passat", 2013, 2021, 9000, 26000, BodyType.break_),
    ("Volkswagen", "Tiguan", 2015, 2022, 14000, 32000, BodyType.suv),
    ("BMW", "Seria 3", 2013, 2022, 11000, 38000, BodyType.sedan),
    ("BMW", "Seria 5", 2014, 2021, 15000, 45000, BodyType.sedan),
    ("BMW", "X3", 2015, 2022, 18000, 48000, BodyType.suv),
    ("Audi", "A4", 2013, 2022, 11000, 36000, BodyType.sedan),
    ("Audi", "A6", 2014, 2021, 14000, 42000, BodyType.sedan),
    ("Audi", "Q5", 2016, 2022, 20000, 50000, BodyType.suv),
    ("Mercedes-Benz", "C-Class", 2014, 2022, 13000, 40000, BodyType.sedan),
    ("Mercedes-Benz", "E-Class", 2015, 2021, 17000, 46000, BodyType.sedan),
    ("Skoda", "Octavia", 2013, 2022, 7500, 23000, BodyType.sedan),
    ("Skoda", "Superb", 2014, 2022, 10000, 28000, BodyType.sedan),
    ("Dacia", "Duster", 2015, 2023, 8000, 20000, BodyType.suv),
    ("Dacia", "Logan", 2016, 2023, 6000, 15000, BodyType.sedan),
    ("Dacia", "Sandero", 2016, 2023, 6500, 16000, BodyType.hatchback),
    ("Ford", "Focus", 2013, 2021, 6500, 19000, BodyType.hatchback),
    ("Ford", "Kuga", 2015, 2022, 12000, 28000, BodyType.suv),
    ("Opel", "Astra", 2013, 2021, 6000, 18000, BodyType.hatchback),
    ("Renault", "Clio", 2014, 2022, 6000, 17000, BodyType.hatchback),
    ("Toyota", "Corolla", 2015, 2023, 11000, 27000, BodyType.sedan),
    ("Toyota", "RAV4", 2016, 2022, 18000, 40000, BodyType.suv),
    ("Hyundai", "Tucson", 2016, 2022, 14000, 33000, BodyType.suv),
    ("Kia", "Sportage", 2015, 2022, 13000, 31000, BodyType.suv),
    ("Mazda", "CX-5", 2015, 2022, 15000, 35000, BodyType.suv),
    ("Nissan", "Qashqai", 2014, 2022, 11000, 29000, BodyType.suv),
    ("Peugeot", "308", 2014, 2021, 7000, 20000, BodyType.hatchback),
    ("Tesla", "Model 3", 2019, 2023, 30000, 55000, BodyType.sedan),
    ("Volvo", "XC60", 2016, 2022, 20000, 48000, BodyType.suv),
    ("Honda", "Civic", 2014, 2022, 9000, 26000, BodyType.hatchback),
]

PALETTE = [
    (31, 78, 121), (46, 109, 77), (120, 46, 46), (72, 61, 110),
    (33, 33, 38), (99, 72, 38), (38, 90, 99), (90, 38, 74),
]


def _font(size: int):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_photo(brand: str, model: str, year: int, index: int, seed: int) -> bytes:
    """Generează o poză substitut, cu un gradient și textul mașinii."""
    width, height = 1200, 800
    base = PALETTE[seed % len(PALETTE)]
    image = Image.new("RGB", (width, height), base)
    draw = ImageDraw.Draw(image)

    # Gradient vertical simplu
    for y in range(height):
        factor = 1 - (y / height) * 0.55
        draw.line(
            [(0, y), (width, y)],
            fill=(int(base[0] * factor), int(base[1] * factor), int(base[2] * factor)),
        )

    # Câteva benzi diagonale, ca fundalul să nu fie plat
    for i in range(-height, width, 90):
        draw.line([(i, height), (i + height, 0)], fill=(255, 255, 255, 8), width=1)

    title = f"{brand} {model}"
    draw.text((70, height // 2 - 90), title, font=_font(78), fill=(255, 255, 255))
    draw.text((70, height // 2 + 10), str(year), font=_font(52), fill=(220, 220, 225))
    draw.text(
        (70, height - 90), f"foto {index + 1}", font=_font(32), fill=(190, 190, 200)
    )

    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


def main() -> None:
    db = SessionLocal()
    try:
        print("Șterg datele existente...")
        db.execute(delete(Message))
        db.execute(delete(Conversation))
        db.execute(delete(Favorite))
        db.execute(delete(CarImage))
        db.execute(delete(Listing))
        db.execute(delete(User))
        db.commit()
        # Repornim numerotarea, ca id-urile să fie 1, 2, 3...
        for table in ("messages", "conversations", "favorites", "car_images", "listings", "users"):
            db.execute(text(f"ALTER SEQUENCE {table}_id_seq RESTART WITH 1"))
        db.commit()

        print("Creez conturile de test...")
        users = [
            User(
                email="ion@example.com",
                password_hash=hash_password("parola1234"),
                full_name="Ion Popescu",
                phone="0722 111 222",
            ),
            User(
                email="maria@example.com",
                password_hash=hash_password("parola1234"),
                full_name="Maria Ionescu",
                phone="0733 333 444",
            ),
            User(
                email="admin@example.com",
                password_hash=hash_password("parola1234"),
                full_name="Administrator",
                phone="0744 555 666",
                is_admin=True,
            ),
        ]
        db.add_all(users)
        db.commit()
        for user in users:
            db.refresh(user)

        print("Creez anunțurile...")
        listings: list[Listing] = []
        for index, (brand, model, y_min, y_max, p_min, p_max, body) in enumerate(CARS):
            year = random.randint(y_min, y_max)
            age = max(1, 2026 - year)

            # Mașinile mai vechi sunt mai ieftine și au mai mulți kilometri
            wear = (year - y_min) / max(1, y_max - y_min)
            price = int(p_min + (p_max - p_min) * wear * random.uniform(0.75, 1.1))
            mileage = int(age * random.randint(11000, 22000))

            if brand == "Tesla":
                fuel = FuelType.electric
                transmission = Transmission.automatic
                capacity = None
            else:
                fuel = random.choice(
                    [FuelType.petrol, FuelType.diesel, FuelType.hybrid, FuelType.lpg]
                )
                transmission = random.choice(
                    [Transmission.manual, Transmission.automatic]
                )
                capacity = random.choice([1200, 1400, 1600, 1800, 2000, 2200, 3000])

            listing = Listing(
                user_id=users[index % 2].id,
                title=f"{brand} {model} {year} · {mileage // 1000} mii km",
                brand=brand,
                model=model,
                year=year,
                price=Decimal(price),
                currency=Currency.EUR,
                mileage_km=mileage,
                fuel_type=fuel,
                transmission=transmission,
                body_type=body,
                engine_capacity=capacity,
                horsepower=random.choice([90, 110, 120, 150, 170, 190, 245, 310]),
                color=random.choice(COLORS),
                condition=CarCondition.used,
                city=random.choice(CITIES),
                description=(
                    f"{brand} {model} din {year}, întreținut periodic în service autorizat. "
                    f"Consum real rezonabil, cauciucuri pe ambele anotimpuri, "
                    f"carte de service la zi. Accept verificare la un service ales de "
                    f"cumpărător. Preț ușor negociabil."
                ),
                status=ListingStatus.active,
                views=random.randint(5, 480),
            )
            db.add(listing)
            listings.append(listing)

        db.commit()
        for listing in listings:
            db.refresh(listing)

        print("Generez pozele (poate dura un minut)...")
        for index, listing in enumerate(listings):
            for photo_index in range(random.randint(2, 4)):
                raw = make_photo(
                    listing.brand, listing.model, listing.year, photo_index, index
                )
                paths = save_image(listing.id, raw)
                db.add(
                    CarImage(
                        listing_id=listing.id,
                        position=photo_index,
                        is_main=(photo_index == 0),
                        **paths,
                    )
                )
        db.commit()

        print("Adaug câteva favorite...")
        for listing in random.sample(listings, 5):
            db.add(Favorite(user_id=users[0].id, listing_id=listing.id))
        db.commit()

        total_images = db.query(CarImage).count()
        print(
            f"\nGata: {len(users)} utilizatori, {len(listings)} anunțuri, "
            f"{total_images} poze."
        )
        print("Conturi de test (parola pentru toate: parola1234):")
        for user in users:
            print(f"  {user.email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
