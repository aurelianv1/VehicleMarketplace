// Configurare comună pentru testele end-to-end (rulează într-un Firefox real, fără interfață).
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import puppeteer from 'puppeteer-core'

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
export const API = process.env.E2E_API_URL ?? 'http://localhost:8000'
export const APP_NAME = 'Golden Marketplace' // ca în src/lib/brand.ts

const here = new URL('.', import.meta.url).pathname
export const REPO_ROOT = new URL('../../', import.meta.url).pathname
export const UPLOADS = `${REPO_ROOT}backend/uploads/listings`
export const FIXTURES = `${here}fixtures`
export const SCREENSHOTS = `${here}screenshots/`
mkdirSync(SCREENSHOTS, { recursive: true })

export function launchBrowser() {
  return puppeteer.launch({
    browser: 'firefox',
    executablePath: process.env.FIREFOX_PATH ?? '/usr/bin/firefox',
    headless: process.env.E2E_HEADFUL ? false : true,
  })
}

/**
 * „Poză de telefon” de peste 5 MB, generată la rulare ca să nu stea 13 MB în git.
 * Zgomotul aleator nu se comprimă, deci fișierul rămâne mare: cel mai rău caz
 * pentru micșorarea din browser (lib/image.ts).
 */
export function bigImagePath() {
  const path = `${FIXTURES}/mare.png`
  if (existsSync(path)) return path

  const width = 3000
  const height = 2000
  const row = width * 3 + 1 // un octet de filtru (0) la începutul fiecărui rând
  const raw = randomBytes(row * height)
  for (let y = 0; y < height; y++) raw[y * row] = 0

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // biți per canal
  header[9] = 2 // RGB

  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(raw, { level: 1 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
  return path
}

/**
 * Rezolvă CAPTCHA-ul aplicației așa cum doar cineva cu cheia serverului poate:
 * tokenul conține HMAC(SECRET_KEY, cod:id), iar codul are 4 caractere din 31,
 * deci încercăm toate cele ~920.000 de combinații (sub 2 secunde).
 * Un robot de pe internet nu are SECRET_KEY, așa că nu poate face asta.
 */
export function solveCaptcha(token) {
  const secret =
    process.env.SECRET_KEY ??
    readFileSync(`${REPO_ROOT}.env`, 'utf8').match(/^SECRET_KEY=(.*)$/m)?.[1]?.trim()
  if (!secret) throw new Error('SECRET_KEY lipsește din .env')
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  for (const a of alphabet) for (const b of alphabet) for (const c of alphabet) for (const d of alphabet) {
    const code = a + b + c + d
    if (createHmac('sha256', secret).update(`${code}:${payload.jti}`).digest('hex') === payload.h) return code
  }
  throw new Error('CAPTCHA nerezolvat (cheia din .env diferă de cea a backend-ului?)')
}
