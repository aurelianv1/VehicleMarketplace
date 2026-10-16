import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { favoritesApi } from '../api/favorites'
import { useAuth } from '../context/AuthContext'

type Props = {
  listingId: number
  initial: boolean
  /** Anunță părintele (ex. pagina Favorite scoate cardul din listă) */
  onChange?: (isFavorite: boolean) => void
  className?: string
}

export default function FavoriteButton({ listingId, initial, onChange, className = '' }: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isFavorite, setIsFavorite] = useState(initial)
  const [busy, setBusy] = useState(false)

  // Dacă lista se reîncarcă (ex. după login), valoarea venită de la server câștigă
  const [prevInitial, setPrevInitial] = useState(initial)
  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setIsFavorite(initial)
  }

  async function toggle() {
    // Vizitatorul neautentificat e trimis la login și adus înapoi pe aceeași pagină
    if (!user) {
      navigate('/login', { state: { from: location } })
      return
    }

    const next = !isFavorite
    setIsFavorite(next) // actualizare optimistă: inima se schimbă imediat
    setBusy(true)
    try {
      const res = next ? await favoritesApi.add(listingId) : await favoritesApi.remove(listingId)
      setIsFavorite(res.is_favorite)
      onChange?.(res.is_favorite)
    } catch {
      setIsFavorite(!next) // cererea a eșuat → revenim la starea reală
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Scoate de la favorite' : 'Adaugă la favorite'}
      title={isFavorite ? 'Scoate de la favorite' : 'Adaugă la favorite'}
      className={`rounded-full bg-white/90 p-2 shadow-sm transition hover:scale-110 disabled:cursor-wait ${className}`}
    >
      <svg
        className={`h-5 w-5 ${isFavorite ? 'fill-red-500 text-red-500' : 'fill-none text-slate-600'}`}
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M12 21s-7.5-4.6-9.5-9.1C1.1 8.6 3.3 5 6.8 5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.5 0 5.7 3.6 4.3 6.9C19.5 16.4 12 21 12 21z" />
      </svg>
    </button>
  )
}
