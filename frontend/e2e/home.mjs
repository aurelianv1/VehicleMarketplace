import { API, APP_NAME, BASE, SCREENSHOTS, launchBrowser } from './config.mjs'

let failures = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra !== '' ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

const browser = await launchBrowser()
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 900 })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
const apiCalls = []
page.on('request', (r) => r.url().startsWith('http://localhost:8000/') && apiCalls.push(`${r.method()} ${r.url().slice(21)}`))

const text = () => page.evaluate(() => document.body.innerText)
const search = () => page.evaluate(() => location.search)
const cards = () => page.$$eval('article', (a) => a.length)
const settle = async () => {
  await page.waitForNetworkIdle({ idleTime: 300, timeout: 8000 }).catch(() => {})
}
const prices = () =>
  page.$$eval('article .text-blue-700', (els) => els.map((e) => Number(e.innerText.replace(/[^\d]/g, ''))))

// Valorile așteptate vin din API, nu din seed: testul merge și cu anunțuri adăugate de mână
const apiPage = async (q) => (await fetch(`${API}/listings?${q}`)).json()
const { total, pages } = await apiPage('per_page=12')
const lastPageCount = total - (pages - 1) * 12
const bmwCount = (await apiPage('brand=BMW&per_page=60')).total
const plural = (n) => (n === 1 ? '1 anunț' : n > 0 && (n % 100 === 0 || n % 100 >= 20) ? `${n} de anunțuri` : `${n} anunțuri`)

// 1. Prima pagină
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
check('12 carduri pe pagina 1', (await cards()) === 12, await cards())
check(`total „${plural(total)}”`, (await text()).includes(plural(total)))
// Pozele au loading="lazy": browserul le încarcă abia când ajung în ecran, deci derulăm ca un utilizator
await page.evaluate(async () => {
  for (const img of document.querySelectorAll('article img')) {
    img.scrollIntoView()
    await new Promise((r) => (img.complete ? r() : img.addEventListener('load', r, { once: true })))
  }
  window.scrollTo(0, 0)
})
const images = await page.$$eval('article img', (imgs) => imgs.map((i) => [i.complete && i.naturalWidth > 0, i.src]))
check('toate pozele s-au încărcat', images.every(([ok]) => ok), images.find(([ok]) => !ok)?.[1] ?? '')
check('URL-uri poze cu /uploads/', images.every(([, src]) => src.startsWith('http://localhost:8000/uploads/listings/')))
const sample = await page.$eval('article', (a) => a.innerText)
check('card formatat (km, €, etichete RO)', / km/.test(sample) && /€/.test(sample) && /(Benzină|Diesel|Hibrid|Electric|GPL)/.test(sample), sample.replace(/\n/g, ' | '))
await page.screenshot({ path: `${SCREENSHOTS}3-home.png` })

// 1b. Caruselul: derulează singur, are săgeți, dispare când se caută ceva
const activeSlide = () => page.$eval('.carousel-dot[aria-current=true]', (d) => d.getAttribute('aria-label'))
check('caruselul e afișat pe prima pagină', (await page.$('[data-testid=carousel]')) !== null)
const slideBefore = await activeSlide()
await page.waitForFunction((before) => document.querySelector('.carousel-dot[aria-current=true]')?.getAttribute('aria-label') !== before, { timeout: 8000 }, slideBefore).catch(() => {})
check('caruselul trece singur la slide-ul următor', (await activeSlide()) !== slideBefore, `${slideBefore} → ${await activeSlide()}`)
await page.click('button[aria-label="Mergi la slide-ul 4"]')
check('bulina 4 → slide-ul 4', (await activeSlide()) === 'Mergi la slide-ul 4')
await page.hover('[data-testid=carousel]')
await new Promise((r) => setTimeout(r, 5600))
check('cu mouse-ul deasupra, caruselul stă pe loc', (await activeSlide()) === 'Mergi la slide-ul 4')
await page.mouse.move(0, 0)

// 2. Paginare
await page.evaluate((last) => [...document.querySelectorAll('nav[aria-label=Paginare] button')].find((b) => b.innerText === last).click(), String(pages))
await settle()
check(`ultima pagină → ?page=${pages} și ${lastPageCount} carduri`, (await search()) === `?page=${pages}` && (await cards()) === lastPageCount, `${await search()} / ${await cards()}`)

// 3. Filtru marcă din formular → URL, pagina resetată
await page.type('input[list=brand-options]', 'BMW')
await page.click('form button[type=submit]')
await settle()
check(`filtru BMW → ?brand=BMW, ${bmwCount} rezultate`, (await search()) === '?brand=BMW' && (await cards()) === bmwCount, `${await search()} / ${await cards()}`)
const titles = await page.$$eval('article h2', (h) => h.map((x) => x.innerText))
check('cu un filtru activ, caruselul nu mai apare', (await page.$('[data-testid=carousel]')) === null)
check('toate rezultatele sunt BMW', titles.every((t) => /BMW/i.test(t)), titles.join(', '))

// 4. Back → înapoi la pagina 3 fără filtru, formularul golit
await page.goBack()
await settle()
const brandValue = await page.$eval('input[list=brand-options]', (i) => i.value)
check(`Back → ?page=${pages}, câmpul Marcă gol`, (await search()) === `?page=${pages}` && brandValue === '' && (await cards()) === lastPageCount, `${await search()} brand="${brandValue}"`)

// 5. Sortare preț crescător
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
await page.select('select:not(form select)', 'price_asc')
await settle()
const asc = await prices()
check('sortare preț crescător', (await search()) === '?sort=price_asc' && asc.every((p, i) => i === 0 || asc[i - 1] <= p), asc.join(' ≤ '))

// 6. Link direct cu filtre combinate + interval de preț
await page.goto(`${BASE}/?fuel_type=diesel&price_max=20000&sort=price_desc`, { waitUntil: 'networkidle0' })
const dieselPrices = await prices()
const fuelSelect = await page.$eval('form select', () =>
  document.querySelectorAll('form select')[3].value,
)
check(
  'link direct: diesel ≤ 20.000 €, desc, formular precompletat',
  dieselPrices.length > 0 && dieselPrices.every((p, i) => p <= 20000 && (i === 0 || dieselPrices[i - 1] >= p)) && fuelSelect === 'diesel',
  `${dieselPrices.join(' ≥ ')} fuel=${fuelSelect}`,
)

// 6b. Pagină inexistentă dintr-un link vechi + titlul tab-ului
await page.goto(`${BASE}/?page=99`, { waitUntil: 'networkidle0' })
check('?page=99 → „Pagina 99 nu există”, nu „niciun anunț”', (await text()).includes('Pagina 99 nu există') && !(await text()).includes('Niciun anunț'))
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText === 'Mergi la prima pagină').click())
await settle()
check('„Mergi la prima pagină” → 12 carduri', (await search()) === '' && (await cards()) === 12)
check('titlul tab-ului pe pagina principală', (await page.title()) === APP_NAME, await page.title())

// 7. Fără rezultate
await page.goto(`${BASE}/?brand=Lamborghini`, { waitUntil: 'networkidle0' })
check('mesaj „Niciun anunț”', (await text()).includes('Niciun anunț nu corespunde filtrelor'))
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText === 'Șterge filtrele').click())
await settle()
check(`„Șterge filtrele” → ${plural(total)}`, (await search()) === '' && (await text()).includes(plural(total)))

// 8. Inimă fără cont → login → înapoi pe pagina principală
await page.click('article button[aria-label="Adaugă la favorite"]')
await settle()
check('inimă fără cont → /login', (await page.evaluate(() => location.pathname)) === '/login')
await page.type('#email', 'maria@example.com')
await page.type('#password', 'parola1234')
await page.click('button[type=submit]')
await page.waitForFunction(() => location.pathname === '/' && document.querySelectorAll('article').length > 0, { timeout: 5000 }).catch(() => {})
await settle()
check('după login → înapoi pe /', (await page.evaluate(() => location.pathname)) === '/')

// 9. Favorit + token expirat simulat: prima cerere POST /favorites primește un token invalid
await page.setRequestInterception(true)
let tampered = false
const tamper = (req) => {
  if (!tampered && req.method() === 'POST' && req.url().includes('/favorites/')) {
    tampered = true
    return req.continue({ headers: { ...req.headers(), authorization: 'Bearer token-expirat' } })
  }
  return req.continue()
}
page.on('request', tamper)
apiCalls.length = 0
const firstId = await page.$eval('article a', (a) => a.getAttribute('href').split('/').pop())
await page.click('article button[aria-label="Adaugă la favorite"]')
await settle()
const favCalls = apiCalls.filter((c) => /favorites|refresh/.test(c) && !c.startsWith('OPTIONS'))
check(
  '401 → refresh → cererea reluată',
  tampered && favCalls.join(',') === `POST /favorites/${firstId},POST /auth/refresh,POST /favorites/${firstId}`,
  JSON.stringify({ favCalls, firstId }),
)
check('inima e plină', (await page.$('article button[aria-pressed=true]')) !== null)
check('încă logat după refresh', (await text()).includes('Ieșire'))
page.off('request', tamper)
await page.setRequestInterception(false)

// 10. După F5, favoritul vine de la server
await page.reload({ waitUntil: 'networkidle0' })
await settle()
const pressed = await page.$eval('article button[aria-label]', (b) => b.getAttribute('aria-pressed'))
check('după F5 inima rămâne plină (din server)', pressed === 'true', pressed)

// curățenie: scoatem favoritul
await page.click('article button[aria-pressed=true]')
await settle()
check('scoaterea de la favorite', (await page.$eval('article button[aria-label]', (b) => b.getAttribute('aria-pressed'))) === 'false')

// 11. Mobil: filtrele sunt ascunse sub buton
await page.setViewport({ width: 390, height: 844 })
await page.goto(`${BASE}/?brand=Dacia`, { waitUntil: 'networkidle0' })
const hiddenBefore = await page.$eval('aside', (a) => getComputedStyle(a).display === 'none')
const btnText = await page.$eval('button[aria-expanded]:not([aria-label])', (b) => b.innerText)
check('mobil: filtre ascunse, buton „Filtre (1)”', hiddenBefore && btnText === 'Filtre (1)', btnText)
await page.screenshot({ path: `${SCREENSHOTS}4-mobile-home.png`, fullPage: false })
await page.click('button[aria-expanded]:not([aria-label])')
await page.screenshot({ path: `${SCREENSHOTS}5-mobile-filters.png`, fullPage: false })

check('fără erori în consolă', consoleErrors.length === 0, consoleErrors.join(' | '))

await browser.close()
console.log(failures ? `\n${failures} verificări au eșuat` : '\nToate verificările au trecut')
process.exit(failures ? 1 : 0)
