# Car Marketplace

Marketplace de mașini — proiect de laborator.
Stack: **React + TypeScript + Tailwind** (frontend), **FastAPI** (backend), **PostgreSQL** (bază de date).

Starea actuală: **Ziua 2 — backend complet (anunțuri, filtre, imagini, favorite).**

---

## Cerințe

- Docker + Docker Compose
- Python 3.11 sau mai nou

## Pornire (prima dată)

```bash
# 1. Copiază fișierul de configurare
cp .env.example .env

# 2. Pornește PostgreSQL + pgAdmin
docker compose up -d

# 3. Instalează dependințele Python
cd backend
python -m venv .venv
source .venv/bin/activate        # pe Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 4. Creează tabelele
alembic upgrade head

# 5. Populează cu date de test (30 de anunțuri cu poze)
python seed.py

# 6. Pornește API-ul
uvicorn app.main:app --reload
```

Verifică la <http://localhost:8000/health> — trebuie să răspundă `{"api":"ok","database":"ok"}`.

Documentația interactivă: <http://localhost:8000/docs>
pgAdmin: <http://localhost:5050> — `admin@example.com` / `admin`

### Conturi de test (după `seed.py`)

| Email | Parolă | Rol |
|---|---|---|
| ion@example.com | parola1234 | utilizator |
| maria@example.com | parola1234 | utilizator |
| admin@example.com | parola1234 | administrator |

> `seed.py` **șterge** datele existente înainte de a le recrea.
> Pozele sunt generate automat (plăci colorate cu marca și modelul). Poți încărca poze reale din interfață.

## Endpoint-uri

### Autentificare
| Metodă | Rută | Descriere |
|---|---|---|
| POST | `/auth/register` | Creează cont |
| POST | `/auth/login` | Autentificare |
| POST | `/auth/refresh` | Reînnoiește access token-ul (din cookie) |
| POST | `/auth/logout` | Șterge cookie-ul de refresh |
| GET | `/users/me` | Datele contului |
| PATCH | `/users/me` | Actualizare nume / telefon |

### Anunțuri
| Metodă | Rută | Acces |
|---|---|---|
| GET | `/listings` | public — filtre, paginare, sortare |
| GET | `/listings/mine` | autentificat — inclusiv draft-urile |
| GET | `/listings/{id}` | public (draft-ul, doar proprietarul) |
| POST | `/listings` | autentificat — creează ca **draft** |
| PATCH | `/listings/{id}` | proprietar |
| POST | `/listings/{id}/publish` | proprietar — cere cel puțin o poză |
| DELETE | `/listings/{id}` | proprietar sau admin |

**Filtre disponibile la `GET /listings`:**
`q`, `brand`, `model`, `city`, `price_min`, `price_max`, `year_min`, `year_max`,
`mileage_max`, `fuel_type`, `transmission`, `body_type`, `page`, `per_page`,
`sort` (`recent`, `price_asc`, `price_desc`, `year_desc`, `mileage_asc`)

```bash
# exemplu
curl "localhost:8000/listings?brand=bmw&price_max=30000&sort=price_asc"
```

### Imagini
| Metodă | Rută | Descriere |
|---|---|---|
| GET | `/listings/{id}/images` | Lista pozelor |
| POST | `/listings/{id}/images` | Upload (mai multe deodată) |
| PATCH | `/listings/{id}/images/{image_id}` | Poză principală / poziție |
| DELETE | `/listings/{id}/images/{image_id}` | Ștergere |

### Favorite
| Metodă | Rută | Descriere |
|---|---|---|
| GET | `/favorites` | Anunțurile salvate |
| POST | `/favorites/{listing_id}` | Salvează |
| DELETE | `/favorites/{listing_id}` | Scoate |

## Cum funcționează imaginile

1. Fișierul ajunge la `POST /listings/{id}/images` ca `multipart/form-data`.
2. Se verifică **conținutul real** al fișierului (nu doar extensia sau content-type, care pot fi falsificate).
3. Se generează automat trei variante:
   - `_full` (max 1600×1200) — pagina de detaliu
   - `_medium` (max 800×600) — cardul din listă
   - `_thumb` (max 400×300) — galeria
4. Fișierele se salvează în `backend/uploads/listings/{listing_id}/`, cu nume generate (UUID).
5. În `car_images` se salvează doar căile, ordinea și care e poza principală.
6. FastAPI le servește ca fișiere statice la `/uploads/...`.

La ștergerea unui anunț, rândurile din `car_images` dispar prin `ON DELETE CASCADE`, iar folderul cu fișiere este șters explicit în cod.

Limite: **5 MB** per poză, maximum **15 poze** per anunț, formate JPEG / PNG / WEBP.
Se configurează în `.env`.

## Fluxul de creare a unui anunț

```
POST /listings              → anunțul se creează cu status "draft" (invizibil public)
POST /listings/{id}/images  → se încarcă pozele
POST /listings/{id}/publish → devine "active" și apare în listă
```

Acest flux există pentru că pozele au nevoie de un `listing_id`, iar un anunț fără poze ar arăta gol în lista publică.

## Decizii de securitate

- Parolele sunt hash-uite cu **bcrypt**.
- **Access token** (JWT, 30 min) în răspuns; **refresh token** (7 zile) în cookie `httpOnly`.
- La login, același mesaj de eroare pentru email inexistent și parolă greșită.
- Verificare de proprietate la editare, ștergere și upload.
- **Telefonul vânzătorului** se întoarce doar utilizatorilor autentificați, ca să nu fie colectat de roboți.
- Imaginile sunt validate după conținut; numele fișierelor sunt generate cu UUID.
- Ștergerea de fișiere e limitată la folderul `uploads/`.
- CORS permite doar originea frontend-ului.

## Comenzi utile

```bash
docker compose up -d          # pornește baza de date
docker compose down           # oprește (datele rămân)
docker compose down -v        # oprește și ȘTERGE datele

alembic revision --autogenerate -m "descriere"   # după modificarea unui model
alembic upgrade head
alembic downgrade -1

python seed.py                # repopulează datele de test
```

## Urmează

- Ziua 3: frontend React (setup, login/register, rute protejate)
- Ziua 4: listă cu filtre + pagina de detaliu
- Ziua 5: adăugare/editare anunț, anunțurile mele, favorite
- Ziua 6: design, responsive, rezolvare buguri
