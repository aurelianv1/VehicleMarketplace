# Car Marketplace

Marketplace de mașini — proiect de laborator.
Stack: **React + TypeScript + Tailwind** (frontend), **FastAPI** (backend), **PostgreSQL** (bază de date).

Starea actuală: **Ziua 1 — infrastructură, bază de date și autentificare.**

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

# 4. Creează tabelele în baza de date
alembic upgrade head

# 5. Pornește API-ul
uvicorn app.main:app --reload
```

Verifică la <http://localhost:8000/health> — trebuie să răspundă `{"api":"ok","database":"ok"}`.

Documentația interactivă a API-ului: <http://localhost:8000/docs>
pgAdmin (vizualizare bază de date): <http://localhost:5050> — user `admin@carmarket.local`, parolă `admin`

## Endpoint-uri disponibile acum

| Metodă | Rută | Descriere |
|---|---|---|
| GET | `/health` | Verifică API + conexiunea la DB |
| POST | `/auth/register` | Creează cont, întoarce access token |
| POST | `/auth/login` | Autentificare |
| POST | `/auth/refresh` | Reînnoiește access token-ul (din cookie) |
| POST | `/auth/logout` | Șterge cookie-ul de refresh |
| GET | `/users/me` | Datele contului curent |
| PATCH | `/users/me` | Actualizare nume / telefon |

### Exemplu rapid

```bash
curl -X POST localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"ion@example.com","password":"parola1234","full_name":"Ion Popescu"}'
```

## Structura bazei de date

- **users** — conturi (email unic, parolă hash-uită cu bcrypt)
- **listings** — anunțurile de mașini (preț `Numeric`, status ca enum, indexuri pe câmpurile de filtrare)
- **car_images** — pozele fiecărui anunț (URL, ordine, poză principală); fișierele stau în `backend/uploads/listings/{id}/`
- **favorites** — anunțurile salvate de utilizatori

## Decizii de securitate

- Parolele sunt hash-uite cu **bcrypt**, niciodată stocate în clar.
- **Access token** (JWT, 30 min) se trimite în răspuns și se ține în memorie în frontend.
- **Refresh token** (7 zile) stă într-un cookie `httpOnly`, deci nu poate fi citit din JavaScript.
- La login, mesajul de eroare este același pentru email inexistent și parolă greșită, ca să nu se poată afla ce conturi există.
- CORS permite doar originea frontend-ului.

## Comenzi utile

```bash
docker compose up -d          # pornește baza de date
docker compose down           # oprește (datele rămân în volum)
docker compose down -v        # oprește și ȘTERGE datele

alembic revision --autogenerate -m "descriere"   # după ce modifici un model
alembic upgrade head                              # aplică migrațiile
alembic downgrade -1                              # anulează ultima migrație
```

## Urmează

- Ziua 2: CRUD anunțuri, filtre, paginare, upload imagini
- Ziua 3-5: frontend React
- Ziua 6: seed cu date de test, design
