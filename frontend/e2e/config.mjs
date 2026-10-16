// Configurare comună pentru testele end-to-end (rulează într-un Firefox real, fără interfață).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import puppeteer from 'puppeteer-core'

export const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173'
export const API = process.env.E2E_API_URL ?? 'http://localhost:8000'

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
