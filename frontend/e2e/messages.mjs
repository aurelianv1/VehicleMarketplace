// Mesagerie în timp real: Maria (cumpărător) și Ion (vânzător), fiecare în fereastra lui.
// Verifică faptul că mesajele și „Văzut” apar la celălalt FĂRĂ reîncărcarea paginii.
import { readFileSync, utimesSync } from 'node:fs'

import { API, BASE, FIXTURES, REPO_ROOT, SCREENSHOTS, launchBrowser } from './config.mjs'

let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra !== '' ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

async function token(email) {
  const r = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'parola1234' }) })
  return (await r.json()).access_token
}
const ionTok = await token('ion@example.com')
const auth = { Authorization: `Bearer ${ionTok}` }

// Pregătire: un anunț activ al lui Ion, creat doar pentru test (șters la final → conversația dispare prin CASCADE)
const listing = await (await fetch(`${API}/listings`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...auth },
  body: JSON.stringify({ title: 'Test mesagerie e2e', brand: 'Dacia', model: 'Duster', year: 2020, price: 14500, mileage_km: 60000, fuel_type: 'diesel', transmission: 'manual', city: 'Arad' }),
})).json()
const form = new FormData()
form.append('files', new Blob([readFileSync(`${FIXTURES}/a.jpg`)], { type: 'image/jpeg' }), 'a.jpg')
await fetch(`${API}/listings/${listing.id}/images`, { method: 'POST', headers: auth, body: form })
await fetch(`${API}/listings/${listing.id}/publish`, { method: 'POST', headers: auth })

const browser = await launchBrowser()
const consoleErrors = []
async function newWindow(name) {
  const ctx = await browser.createBrowserContext() // cookie-uri separate = utilizatori separați
  const page = await ctx.newPage()
  await page.setViewport({ width: 1280, height: 860 })
  page.on('console', (m) => m.type() === 'error' && !/WebSocket|NS_ERROR|ws:\/\//.test(m.text()) && consoleErrors.push(`${name}: ${m.text()}`))
  return page
}
const ion = await newWindow('Ion')
const maria = await newWindow('Maria')

const text = (p) => p.evaluate(() => document.body.innerText)
const settle = (p) => p.waitForNetworkIdle({ idleTime: 300, timeout: 8000 }).catch(() => {})
const waitFor = (p, fn, arg, timeout = 6000) => p.waitForFunction(fn, { timeout }, arg).then(() => true).catch(() => false)
const waitText = (p, t, timeout) => waitFor(p, (t) => document.body.innerText.includes(t), t, timeout)
const badge = (p) => p.$eval('[data-testid=unread-badge]', (b) => b.innerText).catch(() => null)
const bubbles = (p) => p.$$eval('[data-testid=messages] li', (l) => l.map((x) => ({ mine: x.dataset.mine === 'true', text: x.querySelector('div').innerText })))

async function login(p, email) {
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
  await p.type('#email', email)
  await p.type('#password', 'parola1234')
  await p.click('button[type=submit]')
  await waitText(p, 'Ieșire')
}
async function type(p, message) {
  await p.focus('textarea[aria-label=Mesaj]')
  await p.keyboard.type(message)
}

// 1. Vizitator anonim și proprietar: fără casetă de mesaj
await maria.goto(`${BASE}/listings/${listing.id}`, { waitUntil: 'networkidle0' })
check('anonim: link de autentificare, fără „Trimite mesaj”', (await text(maria)).includes('să trimiți un mesaj') && !(await text(maria)).includes('Trimite mesaj'))
await login(ion, 'ion@example.com')
await ion.goto(`${BASE}/listings/${listing.id}`, { waitUntil: 'networkidle0' })
check('proprietar: fără „Trimite mesaj” la propriul anunț', !(await text(ion)).includes('Trimite mesaj'))
await ion.goto(`${BASE}/messages`, { waitUntil: 'networkidle0' })
const ionBadgeBefore = Number((await badge(ion)) ?? 0)

// 2. Maria scrie de pe pagina anunțului
await login(maria, 'maria@example.com')
await maria.goto(`${BASE}/listings/${listing.id}`, { waitUntil: 'networkidle0' })
await maria.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText === 'Trimite mesaj').click())
check('caseta are un mesaj propus', (await maria.$eval('#contact-message', (t) => t.value)).includes('Mai este disponibilă'))
await maria.$eval('#contact-message', (t) => t.select())
await maria.keyboard.press('Backspace')
await maria.type('#contact-message', 'Bună! Prețul e negociabil?')
await maria.evaluate(() => [...document.querySelectorAll('form button[type=submit]')].find((b) => b.innerText === 'Trimite').click())
await waitFor(maria, () => /^\/messages\/\d+$/.test(location.pathname))
await settle(maria)
const convId = Number((await maria.evaluate(() => location.pathname)).split('/').pop())
check('după trimitere → conversația deschisă', convId > 0, await maria.evaluate(() => location.pathname))
check('mesajul apare în fir, cu „Trimis”', (await bubbles(maria)).at(-1)?.text === 'Bună! Prețul e negociabil?' && (await text(maria)).includes('Trimis'))

// 3. Ion îl vede FĂRĂ reload: bulina din meniu + conversația în listă
check('Ion: bulina de necitite apare fără reload', await waitFor(ion, (n) => Number(document.querySelector('[data-testid=unread-badge]')?.innerText) === n, ionBadgeBefore + 1), await badge(ion))
check('Ion: conversația apare în listă fără reload', await waitText(ion, 'Bună! Prețul e negociabil?'))
await ion.screenshot({ path: `${SCREENSHOTS}20-messages-new.png` })

// 4. Ion deschide conversația → Maria vede „Văzut” în timp real
await ion.click(`a[href="/messages/${convId}"]`)
await settle(ion)
check('Ion vede mesajul Mariei', (await bubbles(ion)).some((b) => !b.mine && b.text === 'Bună! Prețul e negociabil?'))
check('Ion: bulina dispare după citire', await waitFor(ion, (n) => Number(document.querySelector('[data-testid=unread-badge]')?.innerText ?? 0) === n, ionBadgeBefore), await badge(ion))
check('Maria: „Văzut” apare fără reload', await waitText(maria, 'Văzut'))

// 5. Ion răspunde cu Enter (Shift+Enter = rând nou) → Maria primește în timp real
await type(ion, 'Puțin negociabil.')
await ion.keyboard.down('Shift')
await ion.keyboard.press('Enter')
await ion.keyboard.up('Shift')
await ion.keyboard.type('Când vreți să o vedeți?')
await ion.keyboard.press('Enter')
check('Maria primește răspunsul fără reload, pe două rânduri', await waitFor(maria, () => [...document.querySelectorAll('[data-testid=messages] li div')].some((d) => d.innerText === 'Puțin negociabil.\nCând vreți să o vedeți?')))
check('câmpul se golește după trimitere', (await ion.$eval('textarea[aria-label=Mesaj]', (t) => t.value)) === '')
await new Promise((r) => setTimeout(r, 500))
check('Maria are firul deschis → nu primește bulină', (await badge(maria)) === null, await badge(maria))
check('Ion vede „Văzut” (Maria e pe conversație)', await waitText(ion, 'Văzut'))

// 6. Text periculos: afișat ca text, nu executat
await type(maria, '<img src=x onerror="window.__xss=1"><b>bold</b>')
await maria.keyboard.press('Enter')
await waitText(ion, '<b>bold</b>')
check('HTML din mesaj afișat ca text, neexecutat', (await text(ion)).includes('<img src=x onerror') && (await ion.evaluate(() => window.__xss)) === undefined)

// 7. Maria pleacă pe pagina principală → răspunsul lui Ion apare ca bulină
await maria.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
await type(ion, 'Vă aștept mâine la 10.')
await ion.keyboard.press('Enter')
check('Maria: bulină pe pagina principală, fără reload', await waitFor(maria, () => Number(document.querySelector('[data-testid=unread-badge]')?.innerText) >= 1))

// 8. Al doilea „Trimite mesaj” la același anunț continuă aceeași conversație
await maria.goto(`${BASE}/listings/${listing.id}`, { waitUntil: 'networkidle0' })
await maria.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText === 'Trimite mesaj').click())
await maria.evaluate(() => [...document.querySelectorAll('form button[type=submit]')].find((b) => b.innerText === 'Trimite').click())
await waitFor(maria, () => /^\/messages\/\d+$/.test(location.pathname))
await settle(maria)
check('al doilea mesaj de pe anunț → aceeași conversație', (await maria.evaluate(() => location.pathname)) === `/messages/${convId}`)
check('istoricul e păstrat', (await bubbles(maria)).length >= 5, (await bubbles(maria)).length)

// 9. Reconectare: repornim backend-ul (uvicorn --reload) → legătura cade și revine singură
utimesSync(`${REPO_ROOT}backend/app/routers/ws.py`, new Date(), new Date())
const sawOffline = await waitText(maria, 'Se reconectează', 8000)
for (let i = 0; i < 40; i++) {
  if (await fetch(`${API}/health`).then((r) => r.ok).catch(() => false)) break
  await new Promise((r) => setTimeout(r, 250))
}
const backOnline = await waitFor(maria, () => !document.body.innerText.includes('Se reconectează'), null, 20000)
check('backend repornit → „Se reconectează…”, apoi revine singur', sawOffline && backOnline, `offline=${sawOffline} online=${backOnline}`)
await waitFor(ion, () => !document.body.innerText.includes('Se reconectează'), null, 20000)
await type(ion, 'Mesaj după reconectare')
await ion.keyboard.press('Enter')
check('după reconectare mesajele sosesc din nou în timp real', await waitText(maria, 'Mesaj după reconectare', 8000))
await new Promise((r) => setTimeout(r, 800))
const openUnread = await maria.$eval(`a[href="/messages/${convId}"]`, (a) => a.querySelector('[aria-label$=necitite]')?.innerText ?? null)
check('conversația deschisă nu are bulină în listă', openUnread === null, openUnread)
await maria.screenshot({ path: `${SCREENSHOTS}21-messages-thread.png` })

// 10. Mobil: lista sau firul, cu buton înapoi
await maria.setViewport({ width: 390, height: 800 })
await maria.goto(`${BASE}/messages/${convId}`, { waitUntil: 'networkidle0' })
await settle(maria)
const listHidden = await maria.$eval('[data-testid=conversation-list]', (l) => getComputedStyle(l).display === 'none')
check('mobil: cu firul deschis, lista e ascunsă', listHidden && (await maria.$('[data-testid=thread]')) !== null)
check('mobil: fără scroll orizontal', !(await maria.evaluate(() => document.documentElement.scrollWidth > innerWidth)))
await maria.screenshot({ path: `${SCREENSHOTS}22-messages-mobile.png` })
await maria.click('button[aria-label="Înapoi la conversații"]')
await settle(maria)
check('mobil: „‹” → lista conversațiilor', (await maria.evaluate(() => location.pathname)) === '/messages' && (await maria.$eval('[data-testid=conversation-list]', (l) => getComputedStyle(l).display !== 'none')))

// 11. Un al treilea utilizator nu are acces
const adminTok = await token('admin@example.com')
const r = await fetch(`${API}/conversations/${convId}`, { headers: { Authorization: `Bearer ${adminTok}` } })
check('alt utilizator (chiar și admin) → 404', r.status === 404, r.status)

check('fără erori în consolă', consoleErrors.length === 0, consoleErrors.join(' | '))
await browser.close()

// Curățenie: ștergerea anunțului șterge și conversația cu mesajele (CASCADE)
await fetch(`${API}/listings/${listing.id}`, { method: 'DELETE', headers: auth })
const gone = await fetch(`${API}/conversations/${convId}`, { headers: auth })
check('curățenie: anunț șters → conversația a dispărut', gone.status === 404, gone.status)

console.log(failures ? `\n${failures} verificări au eșuat` : '\nToate verificările au trecut')
process.exit(failures ? 1 : 0)
