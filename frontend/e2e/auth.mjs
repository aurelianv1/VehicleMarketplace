import { execSync } from 'node:child_process'

import { BASE, REPO_ROOT, SCREENSHOTS, launchBrowser } from './config.mjs'

let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

const browser = await launchBrowser()
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 800 })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))

const text = () => page.evaluate(() => document.body.innerText)
const waitText = (t) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 5000 }, t)
const path = () => page.evaluate(() => location.pathname)

// 1. Rută protejată fără cont → /login
await page.goto(`${BASE}/favorites`, { waitUntil: 'networkidle0' })
check('redirect /favorites → /login', (await path()) === '/login', await path())

// 2. Parolă greșită → mesajul backend-ului
await page.type('#email', 'ion@example.com')
await page.type('#password', 'gresit123')
await page.click('button[type=submit]')
await waitText('Email sau parolă incorecte').catch(() => {})
check('mesaj parolă greșită', (await text()).includes('Email sau parolă incorecte'))

// 3. Login corect → înapoi la pagina cerută
await page.$eval('#password', (el) => (el.value = ''))
await page.click('#password', { clickCount: 3 })
await page.type('#password', 'parola1234')
await page.click('button[type=submit]')
await waitText('Ieșire').catch(() => {})
check('login → înapoi la /favorites', (await path()) === '/favorites', await path())
check('navbar arată „Ieșire”', (await text()).includes('Ieșire'))
await page.screenshot({ path: `${SCREENSHOTS}1-logged-in.png` })

// 4. F5 → rămâne logat (refresh din cookie)
await page.reload({ waitUntil: 'networkidle0' })
check('după F5 rămâne logat pe /favorites', (await path()) === '/favorites' && (await text()).includes('Ieșire'))

// 5. Tokenul NU e în localStorage/sessionStorage
const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
check('nimic în localStorage/sessionStorage', storage === '{}{}', storage)
const jsCookies = await page.evaluate(() => document.cookie)
check('refresh token invizibil din JS (httpOnly)', !jsCookies.includes('refresh_token'), jsCookies || '(gol)')

// 6. Logout → delogat, și rămâne delogat după F5
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText === 'Ieșire').click())
await waitText('Autentificare').catch(() => {})
check('logout → navbar arată „Autentificare”', (await text()).includes('Autentificare'))
await page.reload({ waitUntil: 'networkidle0' })
check('după logout + F5 rămâne delogat', (await text()).includes('Autentificare') && !(await text()).includes('Ieșire'))

// 7. Register: parole diferite → eroare locală
await page.goto(`${BASE}/register`, { waitUntil: 'networkidle0' })
const email = `test${Date.now()}@example.com`
await page.type('#full_name', 'Test Utilizator')
await page.type('#email', email)
await page.type('#password', 'parola1234')
await page.type('#confirm', 'altaparola')
await page.click('button[type=submit]')
check('register: parole diferite', (await text()).includes('Parolele nu coincid'))

// 8. Register valid → logat
await page.$eval('#confirm', (el) => (el.value = ''))
await page.click('#confirm', { clickCount: 3 })
await page.type('#confirm', 'parola1234')
await page.click('button[type=submit]')
await waitText('Test Utilizator').catch(() => {})
check('register valid → logat, numele în navbar', (await text()).includes('Test Utilizator'))

// 9. Register cu email existent → 409
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText === 'Ieșire').click())
await waitText('Autentificare').catch(() => {})
await page.goto(`${BASE}/register`, { waitUntil: 'networkidle0' })
await page.type('#full_name', 'Altcineva')
await page.type('#email', 'ion@example.com')
await page.type('#password', 'parola1234')
await page.type('#confirm', 'parola1234')
await page.click('button[type=submit]')
await waitText('Există deja').catch(() => {})
check('register email duplicat → 409', (await text()).includes('Există deja un cont cu acest email'))

// 10. Mobil: meniul hamburger
await page.setViewport({ width: 390, height: 800 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
await page.click('button[aria-label=Meniu]')
check('meniu mobil se deschide', (await text()).includes('Cont nou'))
await page.screenshot({ path: `${SCREENSHOTS}2-mobile-menu.png` })

check('fără erori în consolă', consoleErrors.length === 0, consoleErrors.join(' | '))

await browser.close()

// Curățenie: API-ul nu are ștergere de cont, așa că scoatem utilizatorul de test direct din bază
const sql = `delete from users where email = '${email}'`
const removed = execSync(`docker compose exec -T db psql -U carmarket -d carmarket -tAc "${sql}"`, { cwd: REPO_ROOT }).toString().trim()
check('curățenie: utilizatorul de test șters', removed === 'DELETE 1', removed)
console.log(failures ? `\n${failures} verificări au eșuat` : '\nToate verificările au trecut')
process.exit(failures ? 1 : 0)
