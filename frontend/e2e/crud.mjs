import { existsSync } from 'node:fs'
import { API, BASE, FIXTURES, SCREENSHOTS, UPLOADS, bigImagePath, launchBrowser } from './config.mjs'

const F = (n) => (n === 'mare.png' ? bigImagePath() : `${FIXTURES}/${n}`)
let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra !== '' ? ' — ' + extra : ''}`)
  if (!ok) failures++
}
const created = new Set()

async function token(email) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'parola1234' }) })
  return (await r.json()).access_token
}
const ionTok = await token('ion@example.com')
const apiGet = async (path, tok = ionTok) => (await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${tok}` } })).json()
const ionMeBefore = await apiGet('/users/me')

const browser = await launchBrowser()
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 900 })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))

const text = () => page.evaluate(() => document.body.innerText)
const path = () => page.evaluate(() => location.pathname)
const settle = () => page.waitForNetworkIdle({ idleTime: 400, timeout: 15000 }).catch(() => {})
const clickText = (t, scope = 'a,button') =>
  page.evaluate((t, scope) => {
    const el = [...document.querySelectorAll(scope)].find((e) => e.innerText.trim() === t && !e.disabled)
    el?.click()
    return Boolean(el)
  }, t, scope)
const waitText = (t, timeout = 15000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, t).catch(() => {})
const setValue = async (sel, value) => {
  // Ca un utilizator: selectează tot, șterge, scrie (React vede fiecare schimbare)
  await page.focus(sel)
  await page.keyboard.down('Control')
  await page.keyboard.press('a')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  if (value) await page.type(sel, value)
}
const select = (id, v) => page.select(`#${id}`, v)

async function login(email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  if ((await text()).includes('Ieșire')) {
    await clickText('Ieșire')
    await settle()
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  }
  await page.type('#email', email)
  await page.type('#password', 'parola1234')
  await page.click('button[type=submit]')
  await waitText('Ieșire')
}

async function fillListing(title, price = '9999') {
  await page.type('#brand', 'Skoda')
  await page.type('#model', 'Octavia')
  await page.type('#year', '2019')
  await page.type('#mileage_km', '123456')
  await select('fuel_type', 'diesel')
  await select('transmission', 'automatic')
  await select('body_type', 'break')
  await page.type('#engine_capacity', '1968')
  await page.type('#horsepower', '150')
  await page.type('#color', 'Gri')
  await page.type('#title', title)
  await page.type('#price', price)
  await page.type('#city', 'Timișoara')
  await page.type('#description', 'Rând 1\nRând 2 — test e2e')
}
const upload = async (...files) => {
  const input = await page.$('[data-testid=image-input]')
  await input.uploadFile(...files.map(F))
}
const lastIonListing = async () => (await apiGet('/listings/mine'))[0]

// ============ A. Validare ============
await login('ion@example.com')
await page.goto(`${BASE}/listings/new`, { waitUntil: 'networkidle0' })
await clickText('Publică anunțul')
await settle()
let t = await text()
check('A1 formular gol → erori pe câmpuri', t.includes('Verifică câmpurile marcate') && t.includes('Marca este obligatoriu') && t.includes('Alege combustibilul') && t.includes('Prețul este obligatoriu'))
check('A2 focus pe primul câmp greșit', (await page.evaluate(() => document.activeElement?.id)) === 'title' || (await page.evaluate(() => document.activeElement?.id)) === 'brand', await page.evaluate(() => document.activeElement?.id))
await page.type('#year', '1850')
await page.type('#price', '12,5,0')
await clickText('Publică anunțul')
t = await text()
check('A3 an în afara intervalului / preț invalid', t.includes('Anul trebuie să fie între 1.900') && t.includes('Prețul trebuie să fie un număr'))
const beforeCount = (await apiGet('/listings/mine')).length
check('A4 nimic trimis la server cu erori', (await apiGet('/listings/mine')).length === beforeCount)

// ============ B. Anunț complet cu 4 poze (inclusiv PNG transparent și poză de 13 MB) ============
await page.goto(`${BASE}/listings/new`, { waitUntil: 'networkidle0' })
await fillListing('Skoda Octavia e2e complet', '15750,50')
await upload('a.jpg', 'b.jpg', 'transparent.png', 'mare.png')
await page.waitForFunction(() => document.querySelectorAll('[data-testid=pending-images] li').length === 4, { timeout: 20000 }).catch(() => {})
const pending = await page.$$eval('[data-testid=pending-images] li', (l) => l.length)
check('B1 4 previzualizări (poza de ~18 MB micșorată, nu respinsă)', pending === 4 && !(await text()).includes('depășește'), pending)
// a doua poză (b.jpg) devine principală
await page.evaluate(() => [...document.querySelectorAll('[data-testid=pending-images] button')].find((b) => b.innerText === 'Fă principală').click())
const firstAlt = await page.$eval('[data-testid=pending-images] li img', (i) => i.src)
check('B2 „Fă principală” mută poza pe primul loc', (await page.$$eval('[data-testid=pending-images] li', (l) => l[0].innerText)).includes('Principală'))
await page.click('button[aria-label="Șterge poza 4"]')
check('B3 ștergere previzualizare', (await page.$$eval('[data-testid=pending-images] li', (l) => l.length)) === 3)
await upload('mare.png') // o adăugăm înapoi
await page.waitForFunction(() => document.querySelectorAll('[data-testid=pending-images] li').length === 4, { timeout: 20000 }).catch(() => {})
const sawProgress = []
const obs = setInterval(async () => {
  const s = await page.$eval('[role=status]', (e) => e.innerText).catch(() => null)
  if (s && !sawProgress.includes(s)) sawProgress.push(s)
}, 30)
await clickText('Publică anunțul')
await page.waitForFunction(() => /^\/listings\/\d+$/.test(location.pathname), { timeout: 30000 }).catch(() => {})
clearInterval(obs)
await settle()
const newId = Number((await path()).split('/').pop())
if (newId) created.add(newId)
check('B4 după publicare → pagina anunțului', Boolean(newId), await path())
check('B5 progres vizibil pe pași', sawProgress.some((s) => s.includes('din 4')), sawProgress.join(' | '))
const det = await apiGet(`/listings/${newId}`)
check('B6 status active, 4 poze, poziții 0..3', det.status === 'active' && det.images.length === 4 && det.images.map((i) => i.position).join() === '0,1,2,3', `${det.status} ${det.images.map((i) => i.position)}`)
check('B7 prețul cu virgulă salvat exact', det.price === '15750.50', det.price)
check('B8 câmpuri opționale salvate', det.engine_capacity === 1968 && det.horsepower === 150 && det.body_type === 'break' && det.color === 'Gri' && det.description.includes('\n'))
check('B9 fișierele există pe disc', existsSync(`${UPLOADS}/${newId}`) && det.images.every((i) => existsSync(`${UPLOADS}/../${i.url}`)))
t = await text()
check('B10 pagina arată prețul și 4/4 poze', t.includes('15.750,5 €') && t.includes('1 / 4'), t.match(/[\d.,]+ €/)?.[0])
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
check('B11 apare primul în lista publică', (await page.$eval('article h2', (h) => h.innerText)) === 'Skoda Octavia e2e complet')
void firstAlt

// ============ C. Fișier fals → ciornă + redirect la editare ============
await page.goto(`${BASE}/listings/new`, { waitUntil: 'networkidle0' })
await fillListing('Skoda Octavia e2e fals')
await upload('a.jpg', 'fals.jpg')
await page.waitForFunction(() => document.querySelectorAll('[data-testid=pending-images] li').length === 2, { timeout: 10000 }).catch(() => {})
await clickText('Publică anunțul')
await page.waitForFunction(() => location.pathname.endsWith('/edit'), { timeout: 20000 }).catch(() => {})
await settle()
const fakeId = Number((await path()).split('/')[2])
if (fakeId) created.add(fakeId)
t = await text()
check('C1 fișier fals → redirect la editare', (await path()).endsWith('/edit'), await path())
check('C2 mesaj cu motivul de la backend (Pillow)', t.includes('ciornă') && t.includes('fals.jpg') && t.includes('nu este o imagine validă'), t.match(/Anunțul a fost salvat[^\n]*/)?.[0])
const fakeDet = await apiGet(`/listings/${fakeId}`)
check('C3 rămâne draft, cu poza bună încărcată', fakeDet.status === 'draft' && fakeDet.images.length === 1, `${fakeDet.status} / ${fakeDet.images.length}`)
check('C4 formularul de editare e precompletat', (await page.$eval('#title', (i) => i.value)) === 'Skoda Octavia e2e fals' && (await page.$eval('#price', (i) => i.value)) === '9999')
await clickText('Salvează și publică')
await page.waitForFunction((id) => location.pathname === `/listings/${id}`, { timeout: 10000 }, fakeId).catch(() => {})
check('C5 „Salvează și publică” → active', (await apiGet(`/listings/${fakeId}`)).status === 'active')

// ============ D. Fără poze: publicare refuzată, ciornă permisă ============
await page.goto(`${BASE}/listings/new`, { waitUntil: 'networkidle0' })
await fillListing('Skoda Octavia e2e ciorna')
await clickText('Publică anunțul')
check('D1 publicare fără poze → mesaj, nimic creat', (await text()).includes('Adaugă cel puțin o poză') && (await path()) === '/listings/new')
await clickText('Salvează ca ciornă')
await page.waitForFunction(() => location.pathname === '/my-listings', { timeout: 10000 }).catch(() => {})
await settle()
const draftL = await lastIonListing()
created.add(draftL.id)
t = await text()
check('D2 ciornă → „Anunțurile mele” cu mesaj', (await path()) === '/my-listings' && t.includes('salvat ca ciornă') && draftL.status === 'draft')
check('D3 cardul are eticheta „Ciornă”', (await page.$eval('article', (a) => a.innerText)).includes('Ciornă'))

// ============ E. Anunțurile mele: acțiuni ============
const card = (id) => `article:has(a[href="/listings/${id}"])`
const cardClick = (id, label) =>
  page.evaluate((sel, label) => [...document.querySelector(sel).querySelectorAll('button,a')].find((b) => b.innerText.trim() === label)?.click(), card(id), label)
await cardClick(draftL.id, 'Publică')
await settle()
check('E1 „Publică” pe ciornă fără poze → eroarea backend-ului', (await text()).includes('Adaugă cel puțin o poză înainte de publicare'))
await cardClick(newId, 'Marchează vândut')
await settle()
check('E2 „Marchează vândut” → eticheta Vândut', (await page.$eval(card(newId), (a) => a.innerText)).includes('Vândut'))
const publicIds = (await (await fetch(`${API}/listings?per_page=60`)).json()).items.map((i) => i.id)
check('E3 vândut → dispare din lista publică', !publicIds.includes(newId))
await cardClick(newId, 'Reactivează')
await settle()
check('E4 „Reactivează” → Activ', (await page.$eval(card(newId), (a) => a.innerText)).includes('Activ'))
await cardClick(draftL.id, 'Șterge')
check('E5 ștergerea cere confirmare', (await page.$eval(card(draftL.id), (a) => a.innerText)).includes('Ștergi definitiv'))
await cardClick(draftL.id, 'Da, șterge')
await settle()
check('E6 ciorna ștearsă', (await page.$(card(draftL.id))) === null && (await fetch(`${API}/listings/${draftL.id}`, { headers: { Authorization: `Bearer ${ionTok}` } })).status === 404)
created.delete(draftL.id)
await page.screenshot({ path: `${SCREENSHOTS}11-my-listings.png` })

// ============ F. Editare: date + poze ============
await page.goto(`${BASE}/listings/${newId}/edit`, { waitUntil: 'networkidle0' })
await setValue('#price', '14900')
await setValue('#color', '')
await clickText('Salvează modificările')
await waitText('Modificările au fost salvate')
const ed = await apiGet(`/listings/${newId}`)
check('F1 preț modificat, culoare ștearsă (null)', ed.price === '14900.00' && ed.color === null, `${ed.price} / ${ed.color}`)
const secondImgId = [...ed.images].sort((a, b) => a.position - b.position)[1].id
await page.evaluate(() => [...document.querySelectorAll('[data-testid=saved-images] button')].find((b) => b.innerText === 'Fă principală').click())
await settle()
const ed2 = await apiGet(`/listings/${newId}`)
check('F2 „Fă principală” → o singură poză principală, cea aleasă', ed2.images.filter((i) => i.is_main).length === 1 && ed2.images.find((i) => i.is_main).id === secondImgId)
await page.click('[data-testid=saved-images] button[aria-label="Șterge poza 1"]')
await clickText('Șterge', '[data-testid=saved-images] button')
await settle()
const ed3 = await apiGet(`/listings/${newId}`)
check('F3 ștergere poză (cu confirmare) → 3 poze', ed3.images.length === 3, ed3.images.length)
await upload('b.jpg')
await page.waitForFunction(() => document.querySelectorAll('[data-testid=saved-images] li').length === 4, { timeout: 15000 }).catch(() => {})
const ed4 = await apiGet(`/listings/${newId}`)
check('F4 upload imediat din editare → 4 poze, poziții unice', ed4.images.length === 4 && new Set(ed4.images.map((i) => i.position)).size === 4, ed4.images.map((i) => i.position).join())
await upload('fals.jpg')
await waitText('nu este o imagine validă')
check('F5 fișier fals la editare → eroare clară', (await text()).includes('fals.jpg: Fișierul nu este o imagine validă'))
await page.screenshot({ path: `${SCREENSHOTS}12-edit.png`, fullPage: true })

// ============ G. Fără drept de editare ============
await login('maria@example.com')
await page.goto(`${BASE}/listings/${newId}/edit`, { waitUntil: 'networkidle0' })
await settle()
check('G1 Maria nu poate edita anunțul lui Ion', (await text()).includes('Nu îți aparține acest anunț') && !(await page.$('#title')))

// ============ H. Favorite ============
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
const favIds = await page.$$eval('article a', (a) => a.slice(0, 2).map((x) => x.getAttribute('href').split('/').pop()))
for (const id of favIds) {
  await page.click(`${card(id)} button[aria-label="Adaugă la favorite"]`)
  await settle()
}
await page.goto(`${BASE}/favorites`, { waitUntil: 'networkidle0' })
await settle()
check('H1 pagina Favorite arată cele 2 anunțuri', (await page.$$('article')).length === 2 && (await text()).includes('2 anunțuri salvate'), JSON.stringify({ favIds, articles: (await page.$$('article')).length, path: await path(), head: (await text()).slice(0, 200) }))
await page.click(`${card(favIds[0])} button[aria-pressed=true]`)
await settle()
check('H2 scos de la favorite → dispare din pagină', (await page.$$('article')).length === 1)
await page.click(`${card(favIds[1])} button[aria-pressed=true]`)
await settle()
check('H3 listă goală → mesaj', (await text()).includes('Nu ai salvat niciun anunț'))

// ============ I. Profil ============
await login('ion@example.com')
await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle0' })
await setValue('#full_name', 'Ion Popescu Test')
await setValue('#phone', '0700 000 000')
await clickText('Salvează')
await waitText('Profilul a fost actualizat')
check('I1 profil salvat, navbar actualizat', (await text()).includes('Profilul a fost actualizat') && (await page.$eval('header', (h) => h.innerText)).includes('Ion Popescu Test'))
await setValue('#full_name', 'X')
await clickText('Salvează')
check('I2 nume prea scurt → eroare', (await text()).includes('minim 2 caractere'))

// ============ J. Mobil: formularul de adăugare ============
await page.setViewport({ width: 390, height: 844 })
await page.goto(`${BASE}/listings/new`, { waitUntil: 'networkidle0' })
check('J1 mobil: fără scroll orizontal', !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)))
await page.screenshot({ path: `${SCREENSHOTS}13-new-mobile.png` })

check('fără erori în consolă', consoleErrors.length === 0, consoleErrors.join(' | '))
await browser.close()

// ============ Curățenie ============
await fetch(`${API}/users/me`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ionTok}` }, body: JSON.stringify({ full_name: ionMeBefore.full_name, phone: ionMeBefore.phone }) })
for (const id of created) {
  await fetch(`${API}/listings/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ionTok}` } })
}
check('curățenie: anunțuri șterse și folderele lor de pe disc', [...created].every((id) => !existsSync(`${UPLOADS}/${id}`)), [...created].join(','))

console.log(failures ? `\n${failures} verificări au eșuat` : '\nToate verificările au trecut')
process.exit(failures ? 1 : 0)
