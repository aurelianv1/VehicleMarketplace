import type { TokenPair } from '../types'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/** API-ul întoarce căi relative ("listings/42/abc_medium.jpg"), deci le prefixăm aici. */
export const imageUrl = (path: string | null | undefined) =>
  path ? `${API_URL}/uploads/${path}` : '/placeholder.svg'

// ---------------------------------------------------------------------------
// Access token-ul stă DOAR în memorie (variabilă de modul), nu în localStorage:
// un script injectat (XSS) ar putea citi localStorage, dar nu și această variabilă.
// La refresh-ul paginii se pierde, iar AuthContext îl recuperează din cookie.
// ---------------------------------------------------------------------------
let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

// AuthContext se abonează aici ca să afle când sesiunea a expirat definitiv
let onSessionExpired: (() => void) | null = null

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type ValidationItem = { loc?: (string | number)[]; msg?: string }

/** `detail` e string pentru 4xx obișnuite, dar array de obiecte pentru 422 (Pydantic). */
function errorMessage(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail

  if (typeof detail === 'string') return detail

  if (Array.isArray(detail)) {
    const fields = (detail as ValidationItem[])
      .map((item) => item.loc?.filter((part) => part !== 'body').join('.'))
      .filter(Boolean)
    return fields.length
      ? `Date invalide la: ${[...new Set(fields)].join(', ')}`
      : 'Datele trimise nu sunt valide'
  }

  if (status >= 500) return 'Eroare de server. Încearcă din nou mai târziu.'
  return `Cererea a eșuat (cod ${status})`
}

// Dacă mai multe cereri primesc 401 în același timp, facem un singur refresh
// și toate așteaptă aceeași promisiune (altfel am avea N refresh-uri în paralel).
let refreshPromise: Promise<TokenPair | null> | null = null

export function refreshSession(): Promise<TokenPair | null> {
  refreshPromise ??= fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include', // trimite cookie-ul httpOnly cu refresh token-ul
  })
    .then(async (res) => {
      if (!res.ok) return null
      const pair = (await res.json()) as TokenPair
      setAccessToken(pair.access_token)
      return pair
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown // obiect → JSON, FormData → multipart (upload de poze)
  query?: Record<string, string | number | boolean | null | undefined>
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = new URL(path, API_URL)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function send(path: string, options: RequestOptions) {
  const headers: Record<string, string> = {}
  let body: BodyInit | undefined

  if (options.body instanceof FormData) {
    body = options.body // browserul pune singur Content-Type cu boundary
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body,
    // Cookie-ul are path=/auth, deci contează doar pentru rutele de autentificare
    credentials: path.startsWith('/auth') ? 'include' : 'same-origin',
  })
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res: Response
  try {
    res = await send(path, options)

    // 401 pe o rută normală = access token expirat → un singur refresh, apoi reluăm.
    // Pe /auth/* nu reîncercăm: acolo 401 înseamnă parolă greșită sau cookie lipsă.
    if (res.status === 401 && !path.startsWith('/auth')) {
      const pair = await refreshSession()
      if (pair) {
        res = await send(path, options)
      } else {
        setAccessToken(null)
        onSessionExpired?.()
      }
    }
  } catch {
    throw new ApiError(0, 'Serverul nu răspunde. Verifică dacă backend-ul este pornit.')
  }

  if (res.status === 204) return undefined as T

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, errorMessage(res.status, data))
  return data as T
}
