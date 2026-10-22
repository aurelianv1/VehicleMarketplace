import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'

import { authApi } from '../api/auth'
import { ApiError } from '../api/client'
import { paymentsApi } from '../api/payments'
import ErrorMessage from '../components/ErrorMessage'
import FormField from '../components/FormField'
import { useAuth } from '../context/AuthContext'
import { PAYMENT_STATUS_LABELS, formatCents, formatDate } from '../lib/format'
import { usePageTitle } from '../lib/usePageTitle'
import type { Payment } from '../types'

export default function Profile() {
  usePageTitle('Profil')
  const { user, setUser } = useAuth()
  const [fullName, setFullName] = useState(user!.full_name)
  const [phone, setPhone] = useState(user!.phone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [payments, setPayments] = useState<Payment[] | null>(null)

  useEffect(() => {
    paymentsApi.mine().then(setPayments).catch(() => setPayments([]))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (fullName.trim().length < 2) return setError('Numele trebuie să aibă minim 2 caractere')

    setSaving(true)
    try {
      // Actualizăm și contextul, ca numele din navbar să se schimbe imediat
      setUser(await authApi.updateMe({ full_name: fullName.trim(), phone: phone.trim() || null }))
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Profilul nu a putut fi salvat')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="mb-6 text-2xl font-bold">Profil</h1>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="text-sm text-slate-600">
          <p>
            Email: <span className="font-medium text-slate-900">{user!.email}</span>
          </p>
          <p>Cont creat pe {formatDate(user!.created_at)}</p>
        </div>
        <ErrorMessage message={error} />
        {saved && (
          <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            Profilul a fost actualizat.
          </div>
        )}
        <FormField label="Nume complet" name="full_name" required maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <FormField
          label="Telefon"
          name="phone"
          type="tel"
          maxLength={30}
          hint="Apare pe anunțurile tale, doar pentru utilizatorii autentificați"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button type="submit" disabled={saving} className="w-full rounded-md bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? 'Se salvează…' : 'Salvează'}
        </button>
      </form>

      {/* Istoricul plăților pentru promovare (Stripe, mod de test) */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Plățile mele</h2>
        {payments && payments.length === 0 && <p className="text-sm text-slate-500">Nu ai promovat încă niciun anunț.</p>}
        {payments && payments.length > 0 && (
          <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            <table className="specs-table w-full text-sm" data-testid="payments-table">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="py-2">Data</th>
                  <th scope="col" className="py-2">Anunț</th>
                  <th scope="col" className="py-2 text-right">Sumă</th>
                  <th scope="col" className="py-2">Stare</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2 whitespace-nowrap">{formatDate(p.created_at)}</td>
                    <td className="py-2">
                      <Link to={`/listings/${p.listing_id}`} className="text-blue-600 hover:underline">
                        {p.listing_title}
                      </Link>
                      {p.promoted_until && <div className="text-xs text-slate-500">promovat până pe {formatDate(p.promoted_until)}</div>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">{formatCents(p.amount_cents, p.currency)}</td>
                    <td className="py-2">{PAYMENT_STATUS_LABELS[p.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
