# VehicleMarketplace — context de proiect

## Despre proiect

Marketplace de mașini, proiect de laborator la facultate.
**Termen: prezentare în săptămâna 19–23 octombrie 2026.** Autorul lucrează singur.

Prioritatea e un demo care funcționează impecabil, nu o aplicație completă.
Mai bine 6 funcționalități solide decât 12 care crapă la prezentare.
Autorul trebuie să poată explica fiecare decizie în fața profesorului.

## Stack

| Strat | Tehnologie |
|---|---|
| Bază de date | PostgreSQL 16 în Docker Compose |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 |
| Auth | JWT (PyJWT) + bcrypt direct |
| Frontend | React + Vite + TypeScript + Tailwind CSS + React Router |
| Imagini | Disc local, `backend/uploads/listings/{id}/` |

### Capcane cu dependințele (nu le reintroduce)

Pe Python 3.13+ **nu** merg:
- `passlib` — importă modulul `crypt`, eliminat din Python 3.13
- `python-jose` — nu mai e întreținut

Proiectul folosește `bcrypt` direct și `PyJWT`. În `requirements.txt` versiunile sunt
minime (`>=`), nu fixate (`==`) — cu versiuni fixate pip nu găsește build-uri pentru
Python 3.13 și instalarea eșuează.

## Structura

```
VehicleMarketplace/
├── docker-compose.yml       # Postgres + pgAdmin
├── .env                     # NU se comite (e în .gitignore)
├── .env.example
├── CLAUDE.md                # acest fișier
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI, CORS, StaticFiles, /health
│   │   ├── core/            # config.py, security.py, deps.py
│   │   ├── db/              # base.py, session.py
│   │   ├── models/          # user, listing, car_image, favorite, enums
│   │   ├── schemas/         # user, token, listing, car_image
│   │   ├── routers/         # auth, users, listings, images, favorites
│   │   └── services/        # storage.py, listing_service.py
│   ├── alembic/
│   ├── uploads/listings/{id}/
│   ├── seed.py
│   └── requirements.txt
└── frontend/                # DE CONSTRUIT
```

---

# PARTEA 1: Backend (gata, testat, nu rescrie)

## Baza de date

**users** — `id`, `email` (unic), `password_hash` (bcrypt), `full_name`, `phone`,
`is_active`, `is_admin`, `created_at`, `updated_at`

**listings** — `id`, `user_id` (FK cascade), `title`, `brand`, `model`, `year`,
`price` (**Numeric(10,2)**, nu Float), `currency`, `mileage_km`, `fuel_type`,
`transmission`, `body_type`, `engine_capacity`, `horsepower`, `color`, `condition`,
`description`, `city`, `status`, `views`, `created_at`, `updated_at`

**car_images** — `id`, `listing_id` (FK cascade), `url`, `url_medium`, `url_thumb`,
`position`, `is_main`, `created_at`

**favorites** — `id`, `user_id`, `listing_id`, `created_at`, unic pe (user_id, listing_id)

Indexuri pe: `brand`, `model`, `year`, `price`, `mileage_km`, `city`, `status`,
`fuel_type`, `transmission`, plus index compus `(status, created_at)`.

## Enum-uri (valorile exacte trimise/primite de API)

```
fuel_type:    petrol | diesel | hybrid | plugin_hybrid | electric | lpg
transmission: manual | automatic | semi_automatic
body_type:    sedan | hatchback | suv | break | coupe | cabrio | minivan | pickup
condition:    new | used | damaged
status:       draft | active | sold | inactive
currency:     EUR | RON
```

Etichetele în română se pun în frontend (`petrol` → „Benzină" etc.), nu în backend.

## Endpoint-uri

Backend-ul rulează pe `http://localhost:8000`. Documentație la `/docs`.

### Auth
| Metodă | Rută | Note |
|---|---|---|
| POST | `/auth/register` | 201, întoarce `TokenPair` + setează cookie |
| POST | `/auth/login` | 200, `TokenPair` + cookie |
| POST | `/auth/refresh` | citește cookie-ul, întoarce `TokenPair` nou |
| POST | `/auth/logout` | 204, șterge cookie-ul |
| GET | `/users/me` | datele contului |
| PATCH | `/users/me` | `{full_name?, phone?}` |

### Listings
| Metodă | Rută | Acces |
|---|---|---|
| GET | `/listings` | public, doar `status=active` |
| GET | `/listings/mine` | autentificat, toate statusurile |
| GET | `/listings/{id}` | public (draft doar pentru proprietar) |
| POST | `/listings` | autentificat → creează cu `status=draft` |
| PATCH | `/listings/{id}` | proprietar |
| POST | `/listings/{id}/publish` | proprietar, **eșuează cu 400 fără poze** |
| DELETE | `/listings/{id}` | proprietar sau admin |

Parametri la `GET /listings`:
`page` (≥1), `per_page` (1–60, implicit 12), `sort`, `q`, `brand`, `model`, `city`,
`price_min`, `price_max`, `year_min`, `year_max`, `mileage_max`, `fuel_type`,
`transmission`, `body_type`

`sort` ∈ `recent` (implicit) | `price_asc` | `price_desc` | `year_desc` | `mileage_asc`

### Images
| Metodă | Rută |
|---|---|
| GET | `/listings/{id}/images` |
| POST | `/listings/{id}/images` — `multipart/form-data`, câmp `files` (repetabil) |
| PATCH | `/listings/{id}/images/{image_id}` — `{is_main?, position?}` |
| DELETE | `/listings/{id}/images/{image_id}` |

### Favorites
| Metodă | Rută |
|---|---|
| GET | `/favorites` → listă de `ListingCard` |
| POST | `/favorites/{listing_id}` → `{is_favorite: true}` |
| DELETE | `/favorites/{listing_id}` → `{is_favorite: false}` |

## Forma răspunsurilor (pentru tipurile TypeScript)

```ts
// POST /auth/login, /auth/register, /auth/refresh
type TokenPair = {
  access_token: string
  token_type: "bearer"
  expires_in: number        // secunde (1800)
  user: User
}

type User = {
  id: number
  full_name: string
  created_at: string
  email: string
  phone: string | null
  is_admin: boolean
}

// GET /listings → Page<ListingCard>
type Page<T> = {
  items: T[]
  total: number
  page: number
  per_page: number
  pages: number
}

type ListingCard = {
  id: number
  title: string
  brand: string
  model: string
  year: number
  price: string             // Decimal serializat ca string: "18500.00"
  currency: "EUR" | "RON"
  mileage_km: number
  fuel_type: FuelType
  transmission: Transmission
  city: string
  status: ListingStatus
  created_at: string
  main_image: string | null // cale relativă, vezi nota de mai jos
  is_favorite: boolean
}

// GET /listings/{id}
type ListingDetail = {
  id: number
  title: string
  brand: string
  model: string
  year: number
  price: string
  currency: "EUR" | "RON"
  mileage_km: number
  fuel_type: FuelType
  transmission: Transmission
  body_type: BodyType | null
  engine_capacity: number | null
  horsepower: number | null
  color: string | null
  condition: CarCondition
  description: string | null
  city: string
  status: ListingStatus
  views: number
  created_at: string
  updated_at: string
  owner: { id: number; full_name: string; created_at: string }
  images: CarImage[]
  is_favorite: boolean
  seller_phone: string | null   // null dacă vizitatorul NU e autentificat
}

type CarImage = {
  id: number
  url: string          // "listings/42/abc_full.jpg"
  url_medium: string | null
  url_thumb: string | null
  position: number
  is_main: boolean
}
```

### Atenție: URL-urile imaginilor sunt relative

API-ul întoarce `"listings/42/abc_medium.jpg"`, nu un URL complet.
Frontend-ul trebuie să prefixeze cu baza fișierelor statice:

```ts
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000"
export const imageUrl = (path: string | null) =>
  path ? `${API_URL}/uploads/${path}` : "/placeholder.svg"
```

`price` vine ca **string** (Decimal serializat), deci pentru formatare:
`new Intl.NumberFormat("ro-RO").format(Number(price))`.

## Erori

Backend-ul întoarce `{"detail": "mesaj în română"}` pentru 4xx.
Pentru 422 (validare Pydantic), `detail` e un **array** de obiecte, nu string —
tratează ambele cazuri când afișezi erori.

Coduri folosite: 401 (neautentificat), 403 (nu e proprietarul), 404 (inexistent),
400 (regulă de business încălcată), 409 (email duplicat), 422 (date invalide).

## Decizii de arhitectură (nu le schimba fără motiv întemeiat)

1. **Anunțul se creează ca `draft`**, apoi se încarcă pozele, apoi se publică.
   Pozele au nevoie de un `listing_id` existent, iar un anunț fără poze ar arăta
   gol în lista publică. `publish` refuză anunțurile fără nicio poză.

2. **Imaginile se validează după conținutul real** (Pillow `verify()`), nu după
   extensie sau `content-type`, care pot fi falsificate. Se generează automat trei
   variante: full (max 1600×1200), medium (800×600), thumb (400×300).
   Numele fișierelor sunt UUID-uri. PNG-urile cu transparență primesc fundal alb.

3. **În baza de date se salvează doar căile**, nu binarul imaginii.

4. **`seller_phone` se întoarce doar utilizatorilor autentificați**, altfel ar fi
   colectat automat de roboți.

5. **Access token** (30 min) în corpul răspunsului → se ține **în memorie** în
   frontend, nu în `localStorage` (expus la XSS).
   **Refresh token** (7 zile) în cookie `httpOnly`, path `/auth`.
   Cererile către `/auth/*` trebuie trimise cu `credentials: "include"`.

6. **Ștergerea unui anunț**: `ON DELETE CASCADE` curăță `car_images`, dar fișierele
   de pe disc se șterg explicit în `storage.delete_listing_folder()`.

7. **Verificarea de proprietate** se face în `_require_owner()`; adminii trec peste.

8. **Vizualizările proprii nu se numără** la incrementarea `views`.

## Date de test

```bash
python seed.py
```

Creează 3 utilizatori și 30 de anunțuri cu ~93 de poze. **Șterge datele existente.**
Parola pentru toate conturile: `parola1234`
- `ion@example.com`, `maria@example.com`, `admin@example.com` (admin)

Pozele sunt plăci colorate generate cu Pillow, cu marca și modelul scrise pe ele.
Nu sunt poze reale de mașini.

---

# PARTEA 2: Frontend (de construit)

## Setup

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router-dom
npm install -D tailwindcss @tailwindcss/vite
```

Variabilă de mediu în `frontend/.env`:
```
VITE_API_URL=http://localhost:8000
```

## Structura propusă

```
frontend/src/
├── api/
│   ├── client.ts        # fetch wrapper: token, refresh la 401, erori
│   ├── auth.ts
│   ├── listings.ts
│   ├── images.ts
│   └── favorites.ts
├── components/
│   ├── Navbar.tsx
│   ├── ListingCard.tsx
│   ├── Filters.tsx
│   ├── Pagination.tsx
│   ├── ImageGallery.tsx
│   ├── ImageUploader.tsx
│   └── FavoriteButton.tsx
├── context/AuthContext.tsx
├── pages/
│   ├── Home.tsx
│   ├── ListingDetail.tsx
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── NewListing.tsx
│   ├── EditListing.tsx
│   ├── MyListings.tsx
│   ├── Favorites.tsx
│   └── Profile.tsx
├── routes/ProtectedRoute.tsx
├── types/index.ts       # tipurile de mai sus
└── lib/format.ts        # preț, km, dată, etichete enum în română
```

## Pagini

| Pagină | Rută | Acces |
|---|---|---|
| Listă anunțuri + filtre | `/` | public |
| Detaliu anunț | `/listings/:id` | public |
| Login | `/login` | public |
| Register | `/register` | public |
| Adaugă anunț | `/listings/new` | autentificat |
| Editează anunț | `/listings/:id/edit` | proprietar |
| Anunțurile mele | `/my-listings` | autentificat |
| Favorite | `/favorites` | autentificat |
| Profil | `/profile` | autentificat |

Rutele protejate redirecționează la `/login` dacă nu ești autentificat.

## Cerințe importante pentru frontend

**Clientul HTTP** trebuie să:
- atașeze `Authorization: Bearer <token>` din memorie (nu localStorage)
- la 401, să încerce o dată `POST /auth/refresh` și să reia cererea
- trimită `credentials: "include"` pentru rutele `/auth/*`
- prefixeze URL-urile imaginilor cu `${API_URL}/uploads/`

**La pornirea aplicației**, încearcă `POST /auth/refresh`. Dacă reușește,
utilizatorul rămâne logat după un refresh de pagină (tokenul din memorie se pierde,
dar cookie-ul rămâne).

**Filtrele din pagina principală** se țin în URL (`useSearchParams`), ca să fie
partajabile și să funcționeze butonul Back al browserului.

**Formularul de adăugare anunț** face trei pași în ordine:
`POST /listings` → `POST /listings/{id}/images` → `POST /listings/{id}/publish`
Dacă al doilea pas eșuează, anunțul rămâne draft și apare în „Anunțurile mele".

**Etichetele în română** pentru enum-uri se definesc într-un singur loc
(`lib/format.ts`), nu împrăștiate prin componente.

## Plan pe zile

- **Ziua 3**: setup Vite + TS + Tailwind, router, `AuthContext`, client HTTP cu
  refresh, Login, Register, `ProtectedRoute`, Navbar
- **Ziua 4**: pagina principală (listă + filtre + paginare), pagina de detaliu cu galerie
- **Ziua 5**: adăugare anunț cu upload, editare, „Anunțurile mele", favorite
- **Ziua 6**: design, responsive pe mobil, rezolvare buguri
- **Ziua 7**: README, repetat prezentarea, rezervă pentru surprize

---

# Lăsat în afara scopului

De menționat la prezentare ca „dezvoltări viitoare":
mesagerie în timp real (WebSocket), panou de administrare, verificare de email,
căutare full-text (acum se folosește `ILIKE`), stocare S3/MinIO, rate limiting.

# Cum pornesc totul

```bash
docker compose up -d                    # PostgreSQL pe :5432
cd backend
source .venv/bin/activate              # venv-ul e în backend/.venv
alembic upgrade head
python seed.py                          # opțional
uvicorn app.main:app --reload           # API pe :8000, /docs

cd ../frontend                          # după ce există
npm run dev                             # pe :5173
```

`CORS_ORIGINS` din `.env` trebuie să includă `http://localhost:5173`.

# Probleme cunoscute

**pgAdmin intră în buclă de restart pe Fedora** (SELinux, permisiuni pe volum).
Nu e blocant — aplicația nu depinde de el.
Fix: `:Z` pe volum și `user: "5050:5050"`, sau scos din `docker-compose.yml`.
Alternativă: `docker compose exec db psql -U carmarket -d carmarket`

# Preferințe de lucru

- Comentariile și mesajele de eroare către utilizator sunt **în română**, cu diacritice.
- Codul (variabile, funcții, rute, componente) e în **engleză**.
- **Testează ce scrii** înainte de a spune că e gata: pornește serverul, cheamă
  endpoint-ul, deschide pagina.
- Nu comite `.env`.
- Commit după fiecare etapă care funcționează.
- Explică deciziile pe scurt — autorul trebuie să le poată apăra la prezentare.
