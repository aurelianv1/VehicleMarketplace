import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import type { Location } from 'react-router-dom'

import { ApiError } from '../api/client'
import CaptchaField from '../components/CaptchaField'
import type { CaptchaValue } from '../components/CaptchaField'
import ErrorMessage from '../components/ErrorMessage'
import FormField from '../components/FormField'
import { useAuth } from '../context/AuthContext'
import { usePageTitle } from '../lib/usePageTitle'

export default function Register() {
  usePageTitle('Cont nou')
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/'

  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', confirm: '' })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [captcha, setCaptcha] = useState<CaptchaValue>({ token: '', answer: '' })
  const [captchaKey, setCaptchaKey] = useState(0)

  if (user) return <Navigate to={from} replace />

  const update = (field: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // Aceleași reguli ca în backend (UserCreate), dar cu mesaje în română
    if (form.full_name.trim().length < 2) return setError('Numele trebuie să aibă minim 2 caractere')
    if (form.password.length < 8) return setError('Parola trebuie să aibă minim 8 caractere')
    if (new TextEncoder().encode(form.password).length > 72)
      return setError('Parola este prea lungă (maxim 72 de caractere)')
    if (form.password !== form.confirm) return setError('Parolele nu coincid')
    if (!captcha.answer.trim()) return setError('Completează codul din imagine')

    setSubmitting(true)
    try {
      await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        password: form.password,
        captcha_token: captcha.token,
        captcha_answer: captcha.answer.trim(),
      })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Înregistrarea a eșuat')
      // Un cod se poate folosi o singură dată, deci după orice eroare cerem altul
      setCaptchaKey((k) => k + 1)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="mb-6 text-2xl font-bold">Cont nou</h1>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow-sm" noValidate>
        <ErrorMessage message={error} />
        <FormField label="Nume complet" name="full_name" autoComplete="name" required value={form.full_name} onChange={update('full_name')} />
        <FormField label="Email" name="email" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
        <FormField
          label="Telefon (opțional)"
          name="phone"
          type="tel"
          autoComplete="tel"
          maxLength={30}
          hint="Vizibil doar utilizatorilor autentificați, pe anunțurile tale"
          value={form.phone}
          onChange={update('phone')}
        />
        <FormField
          label="Parolă"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="Minim 8 caractere"
          value={form.password}
          onChange={update('password')}
        />
        <FormField
          label="Confirmă parola"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={update('confirm')}
        />
        <CaptchaField value={captcha} onChange={setCaptcha} refreshKey={captchaKey} />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? 'Se creează contul…' : 'Creează cont'}
        </button>
        <p className="text-center text-sm text-slate-600">
          Ai deja cont?{' '}
          <Link to="/login" state={location.state} className="font-medium text-blue-600 hover:underline">
            Intră în cont
          </Link>
        </p>
      </form>
    </div>
  )
}
