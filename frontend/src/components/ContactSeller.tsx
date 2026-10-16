import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { MAX_MESSAGE_LENGTH, messagesApi } from '../api/messages'

/** Caseta „Trimite mesaj” de pe pagina anunțului (doar pentru utilizatori logați, nu proprietari). */
export default function ContactSeller({ listingId }: { listingId: number }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('Bună ziua! Mai este disponibilă mașina?')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return setError('Scrie un mesaj')
    setSending(true)
    setError(null)
    try {
      const conversation = await messagesApi.start(listingId, body.trim())
      navigate(`/messages/${conversation.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Mesajul nu a putut fi trimis')
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50"
      >
        Trimite mesaj
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="contact-message" className="block text-sm font-medium text-slate-700">
        Mesaj către vânzător
      </label>
      <textarea
        id="contact-message"
        rows={3}
        maxLength={MAX_MESSAGE_LENGTH}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        autoFocus
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none"
      />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={sending}
          className="flex-1 rounded-md bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {sending ? 'Se trimite…' : 'Trimite'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">
          Renunță
        </button>
      </div>
    </form>
  )
}
