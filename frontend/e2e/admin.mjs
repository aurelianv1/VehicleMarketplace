// Drepturile administratorului în interfață.
import { existsSync, readFileSync } from 'node:fs'

import { API, BASE, FIXTURES, UPLOADS, launchBrowser } from './config.mjs'

let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra !== '' ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

async function token(email) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'parola1234' }) })
  return (await r.json()).access_token
}
const mariaTok = await token('maria@example.com')
const created = new Set()

/** Un anunț activ al Mariei, cu o poză, creat doar pentru test. */
async function mariaListing(title) {
  const auth = { Authorization: `Bearer ${mariaTok}` }
  const l = await (await fetch(`${API}/listings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ title, brand: 'Opel', model: 'Astra', year: 2017, price: 8900, mileage_km: 140000, fuel_type: 'petrol', transmission: 'manual', city: 'Sibiu' }),
  })).json()
  const form = new FormData()
  form.append('files', new Blob([readFileSync(`${FIXTURES}/b.jpg`)], { type: 'image/jpeg' }), 'b.jpg')
  await fetch(`${API}/listings/${l.id}/images`, { method: 'POST', headers: auth, body: form })
  await fetch(`${API}/listings/${l.id}/publish`, { method: 'POST', headers: auth })
  created.add(l.id)
  return l
}

const browser = await launchBrowser()
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 900 })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && !/WebSocket|ws:\/\//.test(m.text()) && consoleErrors.push(m.text()))

const text = () => page.evaluate(() => document.body.innerText)
const settle = () => page.waitForNetworkIdle({ idleTime: 300, timeout: 8000 }).catch(() => {})
const clickText = (t) => page.evaluate((t) => [...document.querySelectorAll('a,button')].find((e) => e.innerText.trim() === t)?.click(), t)
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
  await page.waitForFunction(() => document.body.innerText.includes('Ieșire'), { timeout: 5000 }).catch(() => {})
}
const open = async (id) => {
  await page.goto(`${BASE}/listings/${id}`, { waitUntil: 'networkidle0' })
  await settle()
}

const target = await mariaListing('Anunț de test admin e2e')

// 1. Cine NU vede butonul de ștergere
await open(target.id)
check('anonim: fără „Șterge” și fără „Editează”', !(await text()).includes('Șterge anunțul') && !(await text()).includes('Editează anunțul'))
await login('ion@example.com')
await open(target.id)
check('alt utilizator (Ion): fără „Șterge” și fără „Editează”', !(await text()).includes('Șterge anunțul') && !(await text()).includes('Editează anunțul'))

// 2. Adminul vede butoanele, iar „Renunță” anulează
await login('admin@example.com')
await open(target.id)
check('admin: „Editează” și „Șterge anunțul (administrator)”', (await text()).includes('Editează anunțul') && (await text()).includes('Șterge anunțul (administrator)'))
await clickText('Șterge anunțul (administrator)')
check('ștergerea cere confirmare', (await text()).includes('Ștergi definitiv anunțul'))
await clickText('Renunță')
check('„Renunță” → anunțul rămâne', !(await text()).includes('Ștergi definitiv') && (await fetch(`${API}/listings/${target.id}`)).status === 200)

// 3. Adminul șterge anunțul altcuiva
check('folderul cu poze există înainte', existsSync(`${UPLOADS}/${target.id}`))
await clickText('Șterge anunțul (administrator)')
await clickText('Da, șterge')
await page.waitForFunction(() => location.pathname === '/', { timeout: 8000 }).catch(() => {})
await settle()
check('după ștergere → pagina principală cu mesaj', (await page.evaluate(() => location.pathname)) === '/' && (await text()).includes('Anunțul a fost șters.'))
check('anunțul nu mai există (404)', (await fetch(`${API}/listings/${target.id}`)).status === 404)
check('pozele au fost șterse de pe disc', !existsSync(`${UPLOADS}/${target.id}`))
created.delete(target.id)
await page.reload({ waitUntil: 'networkidle0' })
check('mesajul nu reapare după F5', !(await text()).includes('Anunțul a fost șters.'))

// 4. Proprietarul își șterge anunțul din pagina lui → „Anunțurile mele”
const own = await mariaListing('Anunț propriu de test e2e')
await login('maria@example.com')
await open(own.id)
check('proprietar: „Șterge anunțul” (fără „administrator”)', (await text()).includes('Șterge anunțul') && !(await text()).includes('(administrator)'))
await clickText('Șterge anunțul')
await clickText('Da, șterge')
await page.waitForFunction(() => location.pathname === '/my-listings', { timeout: 8000 }).catch(() => {})
await settle()
check('proprietar: după ștergere → „Anunțurile mele” cu mesaj', (await page.evaluate(() => location.pathname)) === '/my-listings' && (await text()).includes('Anunțul a fost șters.'))
created.delete(own.id)

check('fără erori în consolă', consoleErrors.length === 0, consoleErrors.join(' | '))
await browser.close()

// Curățenie, dacă testul s-a oprit înainte de ștergere
for (const id of created) await fetch(`${API}/listings/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${mariaTok}` } })

console.log(failures ? `\n${failures} verificări au eșuat` : '\nToate verificările au trecut')
process.exit(failures ? 1 : 0)
