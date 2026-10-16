# Teste end-to-end

115 verificări automate care rulează aplicația într-un **Firefox real** (fără
interfață), exact cum ar folosi-o un utilizator: completează formulare, încarcă
poze, apasă butoane, verifică ce apare pe ecran și ce s-a salvat în baza de date.

## Ce acoperă

| Suită | Verificări | Ce testează |
|---|---|---|
| `auth.mjs` | 15 | login, register, logout, sesiunea păstrată după F5, tokenul **nu** e în `localStorage`, cookie-ul de refresh nu e accesibil din JS |
| `home.mjs` | 25 | listă, paginare, filtre în URL, butonul Back, sortare, favorite, **refresh automat la 401** (token expirat simulat) |
| `detail.mjs` | 31 | galerie, telefonul ascuns pentru anonimi, vizualizări numărate o singură dată, ciorne vizibile doar proprietarului, 404 |
| `crud.mjs` | 44 | adăugare în 3 pași, fișier fals respins de backend, poză de ~18 MB micșorată în browser, editare, „Anunțurile mele”, favorite, profil |

## Cum rulez

Trebuie să meargă: PostgreSQL (`docker compose up -d`), backend-ul pe `:8000`,
frontend-ul pe `:5173` (`npm run dev`) și conturile din `python seed.py`
(`ion@`, `maria@`). Anunțurile adăugate de mână nu încurcă testele: numerele
așteptate se citesc din API.

```bash
npm run e2e                  # toate suitele
npm run e2e -- auth home     # doar unele
E2E_HEADFUL=1 npm run e2e    # cu fereastra Firefox vizibilă (bun pentru demo)
```

Variabile opționale: `FIREFOX_PATH` (implicit `/usr/bin/firefox`),
`E2E_BASE_URL`, `E2E_API_URL`.

Testele își creează singure anunțurile și contul de test de care au nevoie și
le șterg la final.
Capturile de ecran ajung în `e2e/screenshots/` (ignorat de git).
