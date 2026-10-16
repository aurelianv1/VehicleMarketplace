import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { listingsApi } from '../api/listings'

type Props = {
  listingId: number
  /** Proprietarul e dus la „Anunțurile mele”; adminul (anunțul altcuiva) la lista publică */
  isOwner: boolean
}

/** Ștergere cu confirmare în doi pași (fără window.confirm, ca să arate la fel peste tot). */
export default function DeleteListingButton({ listingId, isOwner }: Props) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await listingsApi.remove(listingId)
      navigate(isOwner ? '/my-listings' : '/', {
        replace: true,
        state: { notice: 'Anunțul a fost șters.' },
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Anunțul nu a putut fi șters')
      setBusy(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-2 w-full rounded-md py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200 hover:bg-red-50"
      >
        {isOwner ? 'Șterge anunțul' : 'Șterge anunțul (administrator)'}
      </button>
    )
  }

  return (
    <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3" role="alertdialog" aria-label="Confirmă ștergerea">
      <p className="text-sm text-red-800">Ștergi definitiv anunțul, pozele și conversațiile despre el?</p>
      {error && <p role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={remove}
          className="flex-1 rounded-md bg-red-600 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? 'Se șterge…' : 'Da, șterge'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-md bg-white py-1.5 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Renunță
        </button>
      </div>
    </div>
  )
}
