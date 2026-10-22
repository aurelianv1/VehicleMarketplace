import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { ApiError } from '../api/client'
import { paymentsApi } from '../api/payments'
import ErrorMessage from '../components/ErrorMessage'
import Spinner from '../components/Spinner'
import { formatCents, formatDate } from '../lib/format'
import { usePageTitle } from '../lib/usePageTitle'
import type { Payment } from '../types'

const MAX_ATTEMPTS = 5

/**
 * Stripe trimite utilizatorul aici după plată, cu ?session_id=... Nu ne bazăm pe faptul
 * că a ajuns pe această pagină (oricine o poate deschide): cerem serverului să verifice
 * la Stripe dacă plata e confirmată. Dacă Stripe încă procesează, mai întrebăm de câteva ori.
 */
export default function PaymentSuccess() {
  usePageTitle('Plată')
  const [params] = useSearchParams()
  const sessionId = params.get('session_id')
  const [payment, setPayment] = useState<Payment | null>(null)
  const [error, setError] = useState<string | null>(sessionId ? null : 'Lipsește identificatorul plății')
  const [gaveUp, setGaveUp] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    let attempt = 0

    async function check() {
      try {
        const p = await paymentsApi.confirm(sessionId!)
        if (cancelled) return
        setPayment(p)
        if (p.status === 'pending' && ++attempt < MAX_ATTEMPTS) setTimeout(check, 2000)
        else if (p.status === 'pending') setGaveUp(true)
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Plata nu a putut fi verificată')
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  if (error) return <div className="mx-auto max-w-md py-10"><ErrorMessage message={error} /></div>
  if (!payment || (payment.status === 'pending' && !gaveUp)) {
    return (
      <div className="py-10 text-center">
        <Spinner />
        <p className="text-slate-600">Verificăm plata la Stripe…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md py-10" data-testid="payment-result">
      <div className="rounded-lg bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        {payment.status === 'paid' ? (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl text-green-700">✓</div>
            <h1 className="text-xl font-bold">Plata a fost confirmată</h1>
            <p className="mt-2 text-slate-600">
              „{payment.listing_title}” este promovat până pe <strong>{formatDate(payment.promoted_until!)}</strong>.
            </p>
            <p className="mt-1 text-sm text-slate-500">Ai plătit {formatCents(payment.amount_cents, payment.currency)}.</p>
          </>
        ) : payment.status === 'expired' ? (
          <>
            <h1 className="text-xl font-bold">Plata nu a fost finalizată</h1>
            <p className="mt-2 text-slate-600">Sesiunea de plată a expirat. Nu ți s-a retras nicio sumă.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Plata este încă în curs de procesare</h1>
            <p className="mt-2 text-slate-600">Reîncarcă pagina peste câteva momente.</p>
          </>
        )}
        <Link to={`/listings/${payment.listing_id}`} className="mt-5 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Vezi anunțul
        </Link>
      </div>
    </div>
  )
}
