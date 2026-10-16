import { useState } from 'react'
import type { FormEvent } from 'react'

import { authApi } from '../api/auth'
import { ApiError } from '../api/client'
import ErrorMessage from '../components/ErrorMessage'
import FormField from '../components/FormField'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../lib/format'
import { usePageTitle } from '../lib/usePageTitle'

export default function Profile() {
  usePageTitle('Profil')
  const { user, setUser } = useAuth()
  const [fullName, setFullName] = useState(user!.full_name)
  const [phone, setPhone] = useState(user!.phone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

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
    </div>
  )
}
