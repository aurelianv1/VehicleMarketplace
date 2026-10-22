import { useCallback, useEffect, useState } from 'react'

import { authApi } from '../api/auth'

export type CaptchaValue = { token: string; answer: string }

type Props = {
  value: CaptchaValue
  onChange: (value: CaptchaValue) => void
  /** Se schimbă de fiecare dată când părintele vrea un cod nou (ex. după o încercare greșită) */
  refreshKey: number
}

/**
 * Imaginea CAPTCHA generată de server și câmpul pentru cod. Serverul păstrează doar
 * o amprentă a codului în token, deci răspunsul nu se poate citi din pagină.
 */
export default function CaptchaField({ value, onChange, refreshKey }: Props) {
  const [image, setImage] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setError(false)
    authApi
      .captcha()
      .then((c) => {
        setImage(c.image)
        onChange({ token: c.token, answer: '' })
      })
      .catch(() => setError(true))
    // onChange vine de la părinte; nu vrem un cod nou la fiecare randare
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(load, [load, refreshKey])

  return (
    <div>
      <label htmlFor="captcha" className="mb-1 block text-sm font-medium text-slate-700">
        Codul din imagine
      </label>
      <div className="flex items-center gap-2">
        <div className="h-16 w-[180px] shrink-0 overflow-hidden rounded-md ring-1 ring-slate-200">
          {image ? (
            <img src={image} alt="Cod de verificare: scrie caracterele din imagine" width={180} height={64} data-testid="captcha-image" />
          ) : (
            <div className="h-full w-full animate-pulse bg-slate-100" />
          )}
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-md p-2 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
          aria-label="Alt cod"
          title="Alt cod"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M4 4v6h6M20 20v-6h-6M5.6 15a7 7 0 0 0 12.3 2.3M18.4 9A7 7 0 0 0 6.1 6.7" />
          </svg>
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">Codul nu a putut fi încărcat. Apasă pe săgeți.</p>}
      <input
        id="captcha"
        name="captcha"
        required
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={10}
        value={value.answer}
        onChange={(e) => onChange({ ...value, answer: e.target.value.toUpperCase() })}
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm tracking-widest uppercase focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
        placeholder="ex. K7MX"
      />
    </div>
  )
}
