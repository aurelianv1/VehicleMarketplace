import { execSync } from 'node:child_process'
import { API, APP_NAME, BASE, REPO_ROOT, SCREENSHOTS, launchBrowser } from './config.mjs'

let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra !== '' ? ' — ' + extra : ''}`)
  if (!ok) failures++
}
const views = (id) =>
  Number(
    execSync(`docker compose exec -T db psql -U carmarket -d carmarket -tAc "select views from listings where id=${id}"`, {
      cwd: REPO_ROOT,
    }).toString().trim(),
  )

// Pregătire: ciornă temporară a lui Ion, creată prin API
const ion = await (await fetch(`${API}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'ion@example.com', password: 'parola1234' }),
})).json()
const ionPhone = (await (await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${ion.access_token}` } })).json()).phone
const ionListings = await (await fetch(`${API}/listings/mine`, { headers: { Authorization: `Bearer ${ion.access_token}` } })).json()
// Ciorne rămase de la o rulare întreruptă: le ștergem, altfel ar încurca testul
for (const l of ionListings.filter((l) => l.title === 'Ciornă de test e2e')) {
  await fetch(`${API}/listings/${l.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ion.access_token}` } })
}
// Un anunț activ cu cel puțin 3 poze (pentru testele de galerie). Citit ca proprietar,
// deci nu îi crește numărul de vizualizări.
let ionListing = null
for (const l of ionListings.filter((l) => l.status === 'active')) {
  const d = await (await fetch(`${API}/listings/${l.id}`, { headers: { Authorization: `Bearer ${ion.access_token}` } })).json()
  if (d.images.length >= 3) {
    ionListing = l
    break
  }
}
if (!ionListing) throw new Error('Ion nu are niciun anunț activ cu cel puțin 3 poze (rulează seed.py)')
const draft = await (await fetch(`${API}/listings`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ion.access_token}` },
  body: JSON.stringify({ title: 'Ciornă de test e2e', brand: 'Dacia', model: 'Logan', year: 2015, price: 4500, mileage_km: 120000, fuel_type: 'diesel', transmission: 'manual', city: 'Arad' }),
})).json()

const browser = await launchBrowser()
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 900 })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
const detailResponses = []
page.on('response', async (r) => {
  if (r.url().startsWith(API) && /\/listings\/\d+$/.test(r.url()) && r.request().method() === 'GET') detailResponses.push(await r.text().catch(() => ''))
})

const text = () => page.evaluate(() => document.body.innerText)
const settle = () => page.waitForNetworkIdle({ idleTime: 300, timeout: 8000 }).catch(() => {})
const counter = () => page.$eval('.aspect-\\[4\\/3\\] span', (s) => s.innerText).catch(() => null)
const clickText = (t) => page.evaluate((t) => [...document.querySelectorAll('a,button')].find((e) => e.innerText.trim() === t)?.click(), t)

const L = ionListing.id

// 1. Navigare din listă → detaliu, vizitator anonim
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
const before = views(L)
await page.goto(`${BASE}/listings/${L}`, { waitUntil: 'networkidle0' })
await settle()
const after = views(L)
check('anonim: vizualizări +1 (nu +2 din StrictMode)', after - before === 1, `${before} → ${after}`)
const t = await text()
check('titlu, preț, specificații în română', t.includes(ionListing.title) && t.includes('€') && t.includes('Kilometraj') && t.includes('Combustibil'))
check('buton „Autentifică-te ca să vezi telefonul”', t.includes('Autentifică-te ca să vezi telefonul'))
check('telefonul nu e în răspunsul API pentru anonim', detailResponses.every((b) => b.includes('"seller_phone":null')), detailResponses.length)
const mainImg = await page.$eval('.aspect-\\[4\\/3\\] img', (i) => [i.complete && i.naturalWidth > 0, i.src])
check('poza mare încărcată (varianta medium)', mainImg[0] && mainImg[1].includes('_medium'), mainImg[1].split('/').pop())
const thumbs = await page.$$eval('button[aria-label^="Poza "] img', (imgs) => imgs.map((i) => i.src))
check('miniaturi cu varianta thumb', thumbs.length >= 2 && thumbs.every((s) => s.includes('_thumb')), thumbs.length)
await page.screenshot({ path: `${SCREENSHOTS}6-detail.png` })

// 2. Galerie: săgeți, tastatură, miniaturi, ecran complet
const n = thumbs.length
await page.click('button[aria-label="Poza următoare"]')
check('săgeata „următoare” → 2/n', (await counter()) === `2 / ${n}`, await counter())
await page.keyboard.press('ArrowRight')
check('tasta → → 3/n', (await counter()) === `3 / ${n}`, await counter())
await page.click('button[aria-label="Poza anterioară"]')
await page.click('button[aria-label="Poza anterioară"]')
await page.click('button[aria-label="Poza anterioară"]')
check('„anterioară” de la 1 sare la ultima', (await counter()) === `${n} / ${n}`, await counter())
await page.click('button[aria-label="Poza 1"]')
check('click pe miniatura 1 → 1/n', (await counter()) === `1 / ${n}`)
await page.click('button[aria-label="Deschide poza pe tot ecranul"]')
const fullSrc = await page.$eval('[role=dialog] img', (i) => i.src).catch(() => '')
check('ecran complet cu varianta full', fullSrc.includes('_full'), fullSrc.split('/').pop())
await page.screenshot({ path: `${SCREENSHOTS}7-fullscreen.png` })
await page.keyboard.press('Escape')
check('Escape închide ecranul complet', (await page.$('[role=dialog]')) === null)

// 3. Login din pagina de detaliu → înapoi pe anunț → telefonul
await clickText('Autentifică-te ca să vezi telefonul sau să trimiți un mesaj')
await page.waitForSelector('#email')
await page.type('#email', 'maria@example.com')
await page.type('#password', 'parola1234')
await page.click('button[type=submit]')
await page.waitForFunction((L) => location.pathname === `/listings/${L}`, { timeout: 5000 }, L).catch(() => {})
await settle()
check('după login → înapoi pe anunț', (await page.evaluate(() => location.pathname)) === `/listings/${L}`)
check('telefonul ascuns până la click', !(await text()).includes(ionPhone ?? '###') && (await text()).includes('Arată telefonul'))
await clickText('Arată telefonul')
check('„Arată telefonul” afișează numărul', ionPhone && (await text()).includes(ionPhone), ionPhone)
check('Maria nu vede „Editează anunțul”', !(await text()).includes('Editează anunțul'))
await page.click('button[aria-label="Adaugă la favorite"]')
await settle()
check('favorit din pagina de detaliu', (await page.$('button[aria-pressed=true]')) !== null)
await page.click('button[aria-pressed=true]') // curățenie
await settle()

// 4. Proprietarul (Ion): fără favorit/telefon, cu „Editează”, vizualizările nu cresc
await clickText('Ieșire')
await settle()
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
await page.type('#email', 'ion@example.com')
await page.type('#password', 'parola1234')
await page.click('button[type=submit]')
await settle()
const ownerBefore = views(L)
await page.goto(`${BASE}/listings/${L}`, { waitUntil: 'networkidle0' })
await settle()
const ot = await text()
check('proprietar: „Editează anunțul” vizibil', ot.includes('Editează anunțul'))
check('proprietar: fără inimă și fără secțiune de telefon', !(await page.$('button[aria-label*="favorite"]')) && !ot.includes('Arată telefonul'))
check('proprietar: vizualizările nu cresc', views(L) === ownerBefore, `${ownerBefore} → ${views(L)}`)

// 5. Ciorna: vizibilă proprietarului cu avertisment, 404 pentru alții
await page.goto(`${BASE}/listings/${draft.id}`, { waitUntil: 'networkidle0' })
await settle()
const dt = await text()
check('ciornă: proprietarul o vede cu avertisment', dt.includes('Ciornă de test e2e') && dt.includes('ciornă') && dt.includes('Adaugă cel puțin o poză'))
check('ciornă fără poze: placeholder', (await page.$eval('.aspect-\\[4\\/3\\] img', (i) => i.src)).endsWith('/placeholder.svg'))
await clickText('Ieșire')
await settle()
await page.goto(`${BASE}/listings/${draft.id}`, { waitUntil: 'networkidle0' })
await settle()
check('ciornă: anonim → „Anunțul nu există”', (await text()).includes('Anunțul nu există'))

// 5b. Scroll: un anunț deschis din josul listei se deschide sus; titlul tab-ului
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
const lastHref = await page.$$eval('article a', (a) => a[a.length - 1].getAttribute('href'))
await page.click(`article a[href="${lastHref}"]`)
await page.waitForFunction(() => document.querySelector('aside h1'), { timeout: 5000 }).catch(() => {})
check('anunț deschis din josul listei → pagina începe sus', (await page.evaluate(() => scrollY)) === 0, await page.evaluate(() => scrollY))
const h1 = await page.$eval('aside h1', (h) => h.innerText)
check('titlul tab-ului = titlul anunțului', (await page.title()) === `${h1} · ${APP_NAME}`, await page.title())

// 6. Id inexistent + navigare între anunțuri
await page.goto(`${BASE}/listings/999999`, { waitUntil: 'networkidle0' })
check('id inexistent → „Anunțul nu există”', (await text()).includes('Anunțul nu există'))
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
const secondHref = await page.$$eval('article a', (a) => a[1].getAttribute('href'))
await page.click(`article a[href="${secondHref}"]`)
await settle()
check('click pe card → pagina anunțului', (await page.evaluate(() => location.pathname)) === secondHref, secondHref)
await page.goBack()
await settle()
check('Back → înapoi pe listă', (await page.evaluate(() => location.pathname)) === '/' && (await page.$$('article')).length === 12)

// 7. Mobil
await page.setViewport({ width: 390, height: 844 })
await page.goto(`${BASE}/listings/${L}`, { waitUntil: 'networkidle0' })
await settle()
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
check('mobil: fără scroll orizontal', !overflow)
await page.screenshot({ path: `${SCREENSHOTS}8-detail-mobile.png`, fullPage: true })

check('fără erori în consolă', consoleErrors.length === 0, consoleErrors.join(' | '))
await browser.close()

// Curățenie: ștergem ciorna de test
const del = await fetch(`${API}/listings/${draft.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ion.access_token}` } })
check('ciorna de test ștearsă', del.status === 204, del.status)

console.log(failures ? `\n${failures} verificări au eșuat` : '\nToate verificările au trecut')
process.exit(failures ? 1 : 0)
