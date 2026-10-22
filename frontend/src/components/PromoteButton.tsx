import { useEffect, useState } from 'react'

import { ApiError } from '../api/client'
import { paymentsApi } from '../api/payments'
import { formatCents, formatDate } from '../lib/format'
import type { PaymentsConfig } from '../types'

type Props = {
  listingId: number
  promotedUntil: string | null
}

/**
 * Pe pagina propriului anunț activ: plata promovării prin Stripe Checkout.
 * Butonul doar cere serverului o sesiune de plată și duce utilizatorul pe pagina
 * Stripe; datele cardului se introduc acolo, nu în aplicația noastră.
 */
export default function PromoteButton({ listingId, promotedUntil }: Props) {
  const [config, setConfig] = useState<PaymentsConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    paymentsApi.config().then(setConfig).catch(() => {})
  }, [])

  if (!config?.enabled) return null // fără cheie Stripe pe server, funcția nu apare

  async function startPayment() {
    setBusy(true)
    setError(null)
    try {
      const { checkout_url } = await paymentsApi.promote(listingId)
      window.location.assign(checkout_url) // pagina Stripe (alt domeniu)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Plata nu a putut fi inițiată')
      setBusy(false)
    }
  }

  const price = formatCents(config.price_cents, config.currency)

  return (
    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3" data-testid="promote-box">
      {promotedUntil ? (
        <p className="text-sm text-amber-900">
          <strong>Anunț promovat</strong> până pe {formatDate(promotedUntil)}. Apare primul în listă.
        </p>
      ) : (
        <p className="text-sm text-amber-900">
          Promovează anunțul: apare <strong>primul în listă</strong> și în caruselul de pe prima pagină, {config.days} zile.
        </p>
      )}
      {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
      <button
        type="button"
        onClick={startPayment}
        disabled={busy}
        className="mt-2 w-full rounded-md bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
      >
        {busy ? 'Se deschide plata…' : `${promotedUntil ? 'Prelungește' : 'Promovează'} · ${price} / ${config.days} zile`}
      </button>
      <p className="mt-1 text-center text-xs text-amber-800/80">Plată securizată prin Stripe (mod de test)</p>
    </div>
  )
}
